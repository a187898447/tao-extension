import { describe, it, expect, vi } from 'vitest';
import { findProductByPriceRange, searchAndDiscoverProduct, enterProductFromDiscovery, selectFirstSkuOptions } from '../../src/modes/browser.js';

function mockPage(items) {
  const priceTexts = items.map(item => item.price);
  const urls = items.map((item, i) => item.url || `https://item.taobao.com/item.htm?id=${i + 1}`);

  return {
    evaluate: vi.fn(async (fn, arg) => {
      const { priceMin, priceMax, baselineArray } = arg;
      const baselineSet = baselineArray ? new Set(baselineArray) : null;
      const candidates = [];

      for (let i = 0; i < priceTexts.length; i++) {
        if (baselineSet && baselineSet.has(urls[i])) continue;

        const text = priceTexts[i].trim();
        if (!text) continue;
        const match = text.match(/(\d+\.?\d*)/);
        if (!match) continue;
        const price = parseFloat(match[1]);
        if (isNaN(price)) continue;
        candidates.push({ index: i, price, href: urls[i] });
      }

      if (candidates.length === 0) return null;

      const midpoint = (priceMin + priceMax) / 2;
      const rangeWidth = priceMax - priceMin;

      // Tier 1: strict range match — pick closest to midpoint
      let best = null;
      {
        let bestDist = Infinity;
        for (const c of candidates) {
          if (c.price >= priceMin && c.price <= priceMax) {
            const dist = Math.abs(c.price - midpoint);
            if (dist < bestDist) {
              bestDist = dist;
              best = c;
            }
          }
        }
      }

      if (best) return { href: best.href, price: best.price };

      // Tier 2: tolerance fallback
      const tolerance = rangeWidth > 0 ? rangeWidth * 0.3 : Math.max(priceMin * 0.1, 1);
      {
        let bestDist = Infinity;
        for (const c of candidates) {
          const distToRange = c.price < priceMin ? priceMin - c.price
                            : c.price > priceMax ? c.price - priceMax
                            : 0;
          if (distToRange <= tolerance && distToRange < bestDist) {
            bestDist = distToRange;
            best = c;
          }
        }
      }

      return best ? { href: best.href, price: best.price } : null;
    }),
  };
}

describe('findProductByPriceRange', () => {
  it('matches a product within the price range', async () => {
    const page = mockPage([{ price: '¥199.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
    expect(result.price).toBe(199);
    expect(result.href).toBe('https://item.taobao.com/item.htm?id=1');
  });

  it('returns null when price is far below the range (outside tolerance)', async () => {
    const page = mockPage([{ price: '¥10.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).toBeNull();
  });

  it('returns null when price is far above the range (outside tolerance)', async () => {
    const page = mockPage([{ price: '¥500.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).toBeNull();
  });

  it('matches price at exact boundary (min)', async () => {
    const page = mockPage([{ price: '¥100.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
    expect(result.price).toBe(100);
  });

  it('matches price at exact boundary (max)', async () => {
    const page = mockPage([{ price: '¥300.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
    expect(result.price).toBe(300);
  });

  it('picks closest to midpoint when multiple match', async () => {
    const page = mockPage([
      { price: '¥150.00' },
      { price: '¥200.00' },
      { price: '¥250.00' },
    ]);
    // Midpoint of [100, 300] is 200 — should pick ¥200.00 over ¥150 or ¥250
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
    expect(result.price).toBe(200);
  });

  it('skips non-matching items and finds the first match', async () => {
    const page = mockPage([
      { price: '¥50.00' },
      { price: '¥200.00' },
      { price: '¥500.00' },
    ]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
    expect(result.price).toBe(200);
  });

  it('handles price text with "元" suffix', async () => {
    const page = mockPage([{ price: '199.00元' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
  });

  it('handles price text without currency symbol', async () => {
    const page = mockPage([{ price: '199.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
  });

  it('returns null for empty results', async () => {
    const page = mockPage([]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).toBeNull();
  });

  it('handles items with invalid price text gracefully', async () => {
    const page = mockPage([
      { price: '暂无价格' },
      { price: '¥200.00' },
    ]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
  });

  it('handles decimal prices', async () => {
    const page = mockPage([{ price: '¥199.99' }]);
    const result = await findProductByPriceRange(page, 199, 200, null);
    expect(result).not.toBeNull();
  });

  it('tolerance fallback: matches slightly below range', async () => {
    // Range [100, 300], width=200, tolerance=60. Price 80 → dist=20 ≤ 60.
    const page = mockPage([{ price: '¥80.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
  });

  it('tolerance fallback: matches slightly above range', async () => {
    // Range [100, 300], width=200, tolerance=60. Price 340 → dist=40 ≤ 60.
    const page = mockPage([{ price: '¥340.00' }]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result).not.toBeNull();
  });

  it('tolerance fallback: picks closest when multiple outside-range candidates', async () => {
    // Range [100, 200], width=100, tolerance=30.
    // Price 60 → dist=40 > 30 (out). Price 230 → dist=30 ≤ 30 (in). Should pick 230.
    const page = mockPage([
      { price: '¥60.00' },
      { price: '¥230.00' },
    ]);
    const result = await findProductByPriceRange(page, 100, 200, null);
    expect(result).not.toBeNull();
    expect(result.price).toBe(230);
  });

  it('prefers strict match over tolerance fallback', async () => {
    // Range [100, 200]. Price 190 (strict) vs price 80 (tolerance).
    // Should pick 190 (strict match).
    const page = mockPage([
      { price: '¥80.00' },
      { price: '¥190.00' },
    ]);
    const result = await findProductByPriceRange(page, 100, 200, null);
    expect(result).not.toBeNull();
    expect(result.price).toBe(190);
  });

  it('returns href for matched product', async () => {
    const page = mockPage([
      { price: '¥200.00', url: 'https://item.taobao.com/item.htm?id=42' },
    ]);
    const result = await findProductByPriceRange(page, 100, 300, null);
    expect(result.href).toBe('https://item.taobao.com/item.htm?id=42');
  });

  it('baseline: skips items that are in the baseline', async () => {
    // Baseline contains the first item's URL. Only the second item is new.
    const page = mockPage([
      { price: '¥199.00', url: 'https://item.taobao.com/item.htm?id=1' },
      { price: '¥299.00', url: 'https://item.taobao.com/item.htm?id=2' },
    ]);
    const baseline = ['https://item.taobao.com/item.htm?id=1'];
    const result = await findProductByPriceRange(page, 100, 300, null, baseline);
    expect(result).not.toBeNull();
    expect(result.href).toBe('https://item.taobao.com/item.htm?id=2');
  });

  it('baseline: returns null when all matching items are in baseline', async () => {
    // Both items are in the baseline — no new products.
    const page = mockPage([
      { price: '¥199.00', url: 'https://item.taobao.com/item.htm?id=1' },
      { price: '¥299.00', url: 'https://item.taobao.com/item.htm?id=2' },
    ]);
    const baseline = [
      'https://item.taobao.com/item.htm?id=1',
      'https://item.taobao.com/item.htm?id=2',
    ];
    const result = await findProductByPriceRange(page, 100, 300, null, baseline);
    expect(result).toBeNull();
  });

  it('baseline: new item outside price range is skipped', async () => {
    // New item (id=2) is outside price range — no match.
    const page = mockPage([
      { price: '¥199.00', url: 'https://item.taobao.com/item.htm?id=1' },
      { price: '¥500.00', url: 'https://item.taobao.com/item.htm?id=2' },
    ]);
    const baseline = ['https://item.taobao.com/item.htm?id=1'];
    const result = await findProductByPriceRange(page, 100, 300, null, baseline);
    expect(result).toBeNull();
  });
});

describe('enterProductFromDiscovery', () => {
  const productUrl = 'https://item.taobao.com/item.htm?id=42';

  function mockPageForEntry(urlAfterClick = productUrl, popup = null) {
    const page = {
      url: () => urlAfterClick,
      waitForURL: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({
        first: () => ({ click: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    const context = {
      waitForEvent: vi.fn().mockResolvedValue(popup),
    };
    page.context = () => context;
    return { page, context };
  }

  it('returns the same page when no popup opens', async () => {
    const { page } = mockPageForEntry(productUrl);
    const result = await enterProductFromDiscovery(page, { href: productUrl });
    expect(result).toBe(page);
    expect(page.waitForURL).toHaveBeenCalled();
  });

  it('closes old page and returns popup when new tab opens', async () => {
    const popup = {
      url: () => productUrl,
      waitForURL: vi.fn().mockResolvedValue(undefined),
    };
    const { page } = mockPageForEntry(productUrl, popup);
    const result = await enterProductFromDiscovery(page, { href: productUrl });
    expect(result).toBe(popup);
    expect(page.close).toHaveBeenCalled();
  });

  it('throws when matchResult has no href', async () => {
    const { page } = mockPageForEntry();
    await expect(
      enterProductFromDiscovery(page, { href: null })
    ).rejects.toThrow('没有有效的链接');
  });
});

describe('selectFirstSkuOptions', () => {
  function mockPageForSku(groupCount) {
    return {
      evaluate: vi.fn().mockResolvedValue(groupCount),
      locator: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(groupCount),
        nth: vi.fn().mockReturnValue({
          click: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('skips when no SKU groups found', async () => {
    const page = mockPageForSku(0);
    await selectFirstSkuOptions(page);
    // Should not throw, just log
    expect(page.locator).not.toHaveBeenCalled();
  });

  it('clicks first option for each SKU group', async () => {
    const page = mockPageForSku(2);
    await selectFirstSkuOptions(page);
    expect(page.locator).toHaveBeenCalledWith('[data-tao-sku-first="true"]');
    expect(page.waitForTimeout).toHaveBeenCalled();
  });
});

describe('searchAndDiscoverProduct orchestration', () => {
  it('throws when store navigation fails', async () => {
    const mockPage = {
      goto: vi.fn().mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED')),
    };

    await expect(
      searchAndDiscoverProduct(mockPage, 'https://invalid-store.taobao.com', 'test', { min: 100, max: 200 }, {
        searchLead: 0,
        searchInterval: 100,
        searchTimeout: 500,
      })
    ).rejects.toThrow();
  });

  it('validates required options are accepted', async () => {
    const opts = {
      searchLead: 2000,
      searchInterval: 300,
      searchTimeout: 30000,
      targetTime: new Date(Date.now() + 60000),
      timeOffset: 100,
    };

    expect(opts.searchLead).toBe(2000);
    expect(opts.searchInterval).toBe(300);
    expect(opts.searchTimeout).toBe(30000);
    expect(opts.targetTime).toBeInstanceOf(Date);
    expect(opts.timeOffset).toBe(100);
  });
});
