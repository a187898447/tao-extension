const readline = require('readline');
const { createBrowser } = require('../shared/browser-launcher');
const { loadSessionCookies } = require('../shared/auth');
const { writeDiagnostics, writeSuccessLog } = require('../shared/logger');

const CART_URL = 'https://cart.taobao.com/cart.htm';

function getSelectors(config) {
  return config.selectors || {};
}

async function injectCookies(context, profile) {
  const cookies = await loadSessionCookies(profile);
  if (!cookies || cookies.length === 0) {
    console.error('[browser] 未找到登录凭证，请先运行: tao login');
    return false;
  }
  await context.addCookies(cookies);
  console.log(`[browser] 已注入 ${cookies.length} 个 cookies`);
  return true;
}

/**
 * Navigate to product page and select SKU if specified.
 */
async function navigateAndSelectSku(page, productUrl, skuOptions, selectors) {
  console.log(`[browser] 导航到商品页: ${productUrl}`);
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the product page to render
  await page.waitForTimeout(2000);

  // If SKU options specified, select them
  if (skuOptions && Object.keys(skuOptions).length > 0) {
    console.log(`[browser] 选择SKU: ${JSON.stringify(skuOptions)}`);

    // Try to click SKU options
    const skuSelector = selectors.sku_option || '.tb-sku li';
    await page.waitForSelector(skuSelector, { timeout: 10000 }).catch(() => {
      console.log('[browser] SKU 面板未找到，可能无需选择SKU');
      return;
    });

    // For each SKU property (e.g., color, size), click the matching option
    for (const value of Object.values(skuOptions)) {
      // Mark the matching element, then click with Playwright for real mouse events
      const marked = await page.evaluate((valQuery) => {
        const items = document.querySelectorAll(
          'li[data-value], .sku-item, .tb-sku li, .sku-line .sku-item, [role="option"]'
        );
        for (const item of items) {
          const text = item.textContent || '';
          const title = item.getAttribute('title') || '';
          const dataVal = item.getAttribute('data-value') || '';
          if (
            text.includes(valQuery) ||
            title.includes(valQuery) ||
            dataVal.includes(valQuery)
          ) {
            if (!item.classList.contains('selected') && !item.classList.contains('tb-selected')) {
              item.setAttribute('data-tao-sku', 'true');
              return true;
            }
          }
        }
        return false;
      }, value);

      if (marked) {
        try {
          await page.locator('[data-tao-sku="true"]').first().click({ force: true, timeout: 3000 });
          console.log(`[browser] SKU 已选择: ${value}`);
        } catch {
          console.log(`[browser] SKU 点击失败: ${value}`);
        }
        await page.evaluate(() => {
          document.querySelectorAll('[data-tao-sku]').forEach(el => el.removeAttribute('data-tao-sku'));
        });
      } else {
        console.log(`[browser] 未找到匹配的SKU选项: ${value}`);
      }
      await page.waitForTimeout(300);
    }

    // Wait for SKU selection to take effect
    await page.waitForTimeout(500);
  }

}

/**
 * Purchase via product detail page (direct buy).
 */
async function purchaseViaProductPage(context, config) {
  const page = await context.newPage();
  const selectors = getSelectors(config).product || {};

  try {
    await navigateAndSelectSku(
      page,
      config.productUrl,
      config.sku ? (typeof config.sku === 'string' ? JSON.parse(config.sku) : config.sku) : null,
      selectors
    );

    await clickBuyNowButton(page, { product: selectors });
    console.log('[browser] 等待跳转到确认页...');

    return page;
  } catch (err) {
    console.error(`[browser] 商品页操作失败: ${err.message}`);
    await page.close();
    throw err;
  }
}

/**
 * Score all visible DOM elements matching keywords, mark the best one.
 * Shared by clickByText, clickCheckoutButton, and clickBuyNowButton.
 *
 * Returns true if a matching element was found and marked.
 */
async function findAndMarkBest(page, { keywords, attrName, textMaxLen = 50, childMaxLen = 50, excludeTexts = [], exact = false, dismissOverlays = false }) {
  return page.evaluate(({ keywords, attrName, textMaxLen, childMaxLen, excludeTexts, exact, dismissOverlays }) => {
    if (dismissOverlays) {
      // Clear previous marks
      document.querySelectorAll(`[${attrName}]`).forEach(el => el.removeAttribute(attrName));

      // Dismiss visible blocking dialogs that intercept clicks
      const overlays = document.querySelectorAll(
        '.next-overlay-wrapper, .next-dialog-wrapper, [class*="-loading-mask"], [class*="-loading-overlay"]'
      );
      for (const el of overlays) {
        const r = el.getBoundingClientRect();
        if (r.width <= 30 && r.height <= 30) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const text = (el.textContent || '').trim();
        const isBlocking = text.includes('网络拥挤') || text.includes('网络异常')
          || text.includes('繁忙') || text.includes('拥挤') || text.includes('稍后再试')
          || text.includes('人数较多') || text.includes('系统繁忙')
          || text.includes('我知道了') || text.includes('知道了') || text.includes('确定');
        if (!isBlocking) continue;
        // Click dismiss button first — properly closes React-controlled dialogs
        let btn = el.querySelector(
          '.next-dialog-close, .ui-dialog-close, .close, [class*="close"], [class*="Close"]'
        );
        if (!btn) {
          btn = el.querySelector(
            'button, .next-btn, .ui-btn, [class*="btn"], [class*="Btn"], [role="button"]'
          );
        }
        if (btn) btn.click();
        // Always hide as fallback
        el.style.setProperty('display', 'none', 'important');
      }
    }

    function score(el) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return -1;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return -1;
      const tag = el.tagName.toLowerCase();
      const t = (el.textContent || '').trim();
      let s = (100 - Math.min(t.length, 100));
      if (tag === 'button') s += 300;
      else if (tag === 'a') s += 200;
      else if (el.getAttribute('role') === 'button') s += 100;
      // Bonus for elements with no matching-text children (leaf nodes)
      const children = el.querySelectorAll('*');
      let hasMatchingChild = false;
      for (const child of children) {
        const ct = (child.textContent || '').trim();
        if (ct.length > childMaxLen) continue;
        for (const kw of keywords) { if (exact ? ct === kw : ct.includes(kw)) { hasMatchingChild = true; break; } }
        if (hasMatchingChild) break;
      }
      if (!hasMatchingChild) s += 50;
      return s;
    }

    const all = document.querySelectorAll('*');
    let best = null;
    let bestScore = -1;

    for (const el of all) {
      if (el.tagName === 'BODY' || el.tagName === 'HTML' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      const t = (el.textContent || '').trim();
      if (t.length > textMaxLen) continue;
      let excluded = false;
      for (const et of excludeTexts) { if (t.includes(et)) { excluded = true; break; } }
      if (excluded) continue;
      let matches = false;
      for (const kw of keywords) { if (exact ? t === kw : t.includes(kw)) { matches = true; break; } }
      if (!matches) continue;
      const s = score(el);
      if (s > bestScore) { best = el; bestScore = s; }
    }

    if (best) { best.setAttribute(attrName, 'true'); return true; }
    return false;
  }, { keywords, attrName, textMaxLen, childMaxLen, excludeTexts, exact, dismissOverlays });
}

function cleanupMarked(page, attrName) {
  return page.evaluate((name) => {
    document.querySelectorAll(`[${name}]`).forEach(el => el.removeAttribute(name));
  }, attrName);
}

/**
 * Dismiss visible blocking dialogs (network busy, error prompts, etc.).
 * Clicks the dismiss/confirm button to properly close React-controlled dialogs,
 * then hides the overlay as a fallback.
 * Returns the number of dialogs dismissed.
 */
function dismissDialogs(page) {
  return page.evaluate(() => {
    const overlays = document.querySelectorAll(
      '.next-overlay-wrapper, .next-dialog-wrapper, [class*="-loading-mask"], [class*="-loading-overlay"]'
    );
    let dismissed = 0;
    for (const el of overlays) {
      const r = el.getBoundingClientRect();
      if (r.width <= 30 && r.height <= 30) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const text = (el.textContent || '').trim();
      const isBlocking = text.includes('网络拥挤') || text.includes('网络异常')
        || text.includes('繁忙') || text.includes('拥挤') || text.includes('稍后再试')
        || text.includes('人数较多') || text.includes('系统繁忙')
        || text.includes('我知道了') || text.includes('知道了') || text.includes('确定');
      if (!isBlocking) continue;
      // Click dismiss button first — properly closes React-controlled dialogs
      let btn = el.querySelector(
        '.next-dialog-close, .ui-dialog-close, .close, [class*="close"], [class*="Close"]'
      );
      // Fall back to confirm button (e.g. "我知道了", "确定")
      if (!btn) {
        btn = el.querySelector(
          'button, .next-btn, .ui-btn, [class*="btn"], [class*="Btn"], [role="button"]'
        );
      }
      if (btn) { btn.click(); dismissed++; }
      // Always hide as fallback in case click didn't fully close it
      el.style.setProperty('display', 'none', 'important');
    }
    return dismissed;
  });
}

/**
 * Click an element found by text, using real Playwright mouse events.
 * JS-based DOM click doesn't trigger React synthetic events, so we:
 * 1. Mark the element with a data attribute via evaluate()
 * 2. Click it with Playwright's real mouse via locator
 */
async function clickByText(page, text, exact = false) {
  const attr = 'data-tao-target';
  const marked = await findAndMarkBest(page, {
    keywords: [text],
    attrName: attr,
    textMaxLen: 50,
    childMaxLen: 50,
    exact,
  });

  if (!marked) return false;

  try {
    await page.locator(`[${attr}="true"]`).first().click({ timeout: 3000 });
    await cleanupMarked(page, attr);
    return true;
  } catch {
    await cleanupMarked(page, attr);
    return false;
  }
}

/**
 * Search for and click an element by keyword across the page and all iframes.
 * Tries all matching candidates, preferring elements with short text (innermost).
 */
async function tryClickInFrames(page, keyword) {
  const locatorStr = `button:has-text("${keyword}"), a:has-text("${keyword}"), [class*="btn"]:has-text("${keyword}"), div:has-text("${keyword}")`;

  for (const frame of page.frames()) {
    const candidates = frame.locator(locatorStr);
    const count = await candidates.count();
    if (count === 0) continue;

    // Score candidates by text length — prefer short text (innermost element)
    let bestIdx = -1;
    let bestLen = Infinity;
    for (let i = 0; i < count; i++) {
      try {
        const text = (await candidates.nth(i).textContent()) || '';
        if (text.length < bestLen) { bestIdx = i; bestLen = text.length; }
      } catch { /* element may have detached */ }
    }

    if (bestIdx >= 0) {
      try {
        await candidates.nth(bestIdx).click({ force: true, timeout: 3000 });
        if (frame !== page.mainFrame()) console.log(`[browser] 在 iframe 中找到并点击了"${keyword}"`);
        return true;
      } catch { /* best candidate failed — try all others */ }
    }

    // Fall back: try every candidate
    for (let i = 0; i < count; i++) {
      try { await candidates.nth(i).click({ force: true, timeout: 2000 }); return true; } catch { /* candidate not clickable */ }
    }
  }
  return false;
}

/**
 * Pre-detect the checkout button on the cart page and mark it.
 * Used by scheduled purchase to verify readiness before the target time.
 * The marked element is later clicked by clickDetectedCheckoutButton for
 * minimal latency at the target instant.
 * Returns true if the floating checkout bar with a clickable button is found.
 */
async function detectCheckoutButton(page, _selectors) {
  // Wait for cart page SPA to settle
  await page.waitForTimeout(2000);

  const attr = 'data-tao-checkout-ready';

  // Try main frame first with the scoring system
  const found = await findAndMarkBest(page, {
    keywords: ['结算', '去结算'],
    attrName: attr,
    textMaxLen: 20,
    childMaxLen: 20,
    excludeTexts: ['明细', '优惠', '合计', '减免'],
  });

  if (found) {
    const info = await page.evaluate((a) => {
      const el = document.querySelector(`[${a}="true"]`);
      if (!el) return 'unknown';
      const r = el.getBoundingClientRect();
      return `${el.tagName}.${(el.className || '').toString().split(' ')[0]} rect=${r.width}x${r.height} text="${(el.textContent || '').trim()}"`;
    }, attr);
    console.log(`[browser] 结算按钮已就绪(已标记): ${info}`);
    return true;
  }

  // Fall back: search across all frames and mark
  for (const frame of page.frames()) {
    try {
      const hasBtn = await frame.evaluate((a) => {
        const keywords = ['结算', '去结算'];
        const all = document.querySelectorAll('div, button, a, [role="button"]');
        for (const el of all) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          const t = (el.textContent || '').trim();
          if (t.length > 20) continue;
          for (const kw of keywords) {
            if (t.includes(kw) && t.length <= 6) {
              el.setAttribute(a, 'true');
              return `${el.tagName}.${el.className?.toString()?.split(' ')[0] || ''} rect=${r.width}x${r.height} text="${t}"`;
            }
          }
        }
        return null;
      }, attr);
      if (hasBtn) {
        console.log(`[browser] 结算按钮已就绪(iframe): ${hasBtn}`);
        return true;
      }
    } catch { /* cross-origin frame */ }
  }
  console.log('[browser] 结算按钮未检测到，可能浮动栏未渲染');
  return false;
}

/**
 * Click the checkout button with retry loop.
 * Keeps retrying (dismiss dialogs → click pre-marked button → check nav)
 * to survive network-busy dialogs that block the checkout transition.
 * Full strategy search is only used once as a one-shot fallback.
 */
async function clickDetectedCheckoutButton(page, selectors) {
  const tStart = Date.now();
  const preAttr = 'data-tao-checkout-ready';
  const deadline = Date.now() + 10000;

  // Dismiss any blocking dialogs before first attempt
  try { await dismissDialogs(page); } catch { /* page may be navigating */ }

  // --- First attempt: pre-marked fast path ---
  try {
    const preBtn = page.locator(`[${preAttr}="true"]`);
    if (await preBtn.count() > 0) {
      await preBtn.first().click({ force: true, timeout: 2000, noWaitAfter: true });
      const pollStart = Date.now();
      while (Date.now() - pollStart < 1500) {
        await page.waitForTimeout(100);
        try { if (!page.url().includes('cart.taobao.com')) break; } catch { /* navigating */ }
      }
      if (!page.url().includes('cart.taobao.com')) {
        await cleanupMarked(page, preAttr);
        console.log(`[browser] 已点击"结算" (预标记) +${Date.now() - tStart}ms`);
        return;
      }
      await cleanupMarked(page, preAttr);
    }
  } catch { /* pre-marked element gone */ }

  // --- One-shot fallback: full multi-strategy search ---
  console.log(`[browser] 预标记未命中 +${Date.now() - tStart}ms，尝试完整搜索...`);
  try {
    await clickCheckoutButton(page, selectors, true);
    console.log(`[browser] 已点击"结算" (策略搜索) +${Date.now() - tStart}ms`);
    return;
  } catch (e) {
    console.log(`[browser] 策略搜索失败: ${e.message.substring(0, 80)}`);
  }

  // --- Retry loop: dismiss dialogs + re-click pre-marked button only ---
  while (Date.now() < deadline) {
    try { await dismissDialogs(page); } catch { /* navigating */ }

    try {
      if (!page.url().includes('cart.taobao.com')) {
        console.log(`[browser] 已离开购物车 +${Date.now() - tStart}ms`);
        return;
      }
    } catch { /* navigating */ }

    // Re-detect and click checkout button
    const attr = 'data-tao-checkout-retry';
    try {
      const found = await findAndMarkBest(page, {
        keywords: ['结算', '去结算'],
        attrName: attr,
        textMaxLen: 20,
        childMaxLen: 20,
        excludeTexts: ['明细', '优惠', '合计', '减免', '已售', '下架', '失效'],
        dismissOverlays: true,
      });
      if (found) {
        await page.locator(`[${attr}="true"]`).first().click({ force: true, timeout: 2000, noWaitAfter: true });
        const pollStart = Date.now();
        while (Date.now() - pollStart < 1500) {
          await page.waitForTimeout(100);
          try { if (!page.url().includes('cart.taobao.com')) break; } catch { /* navigating */ }
        }
        if (!page.url().includes('cart.taobao.com')) {
          console.log(`[browser] 已点击"结算" (retry) +${Date.now() - tStart}ms`);
          return;
        }
      }
    } catch { /* element gone, retry */ }

    await new Promise(r => setTimeout(r, 300));
  }

  throw new Error(`结算按钮重试超时 (${Date.now() - tStart}ms)`);
}

/**
 * Click the checkout button on the cart page using multiple fallback strategies.
 * Throws if no button can be found or clicked.
 */
async function clickCheckoutButton(page, selectors, skipWait = false) {
  // Wait for cart page to render (SPA), unless we're already on it
  if (!skipWait) {
    await page.waitForTimeout(1500);
  }

  const tStart = Date.now();
  const frames = page.frames();
  console.log(`[browser] 页面共 ${frames.length} 个 frame`);

  // Helper: after a click, verify we actually left the cart page.
  // Uses waitForURL for early return — avoids the fixed 1.5s penalty.
  async function verifyNav() {
    try {
      await page.waitForURL('**/order/**', { timeout: 3000 });
      return true;
    } catch {
      // Didn't navigate to an order page within 3s
      return !page.url().includes('cart.taobao.com');
    }
  }

  // Strategy 1 (DEFAULT): mark+click — find the best "结算"/"去结算" element,
  // mark it, and click with Playwright. This is the most reliable approach.
  const checkoutAttr = 'data-tao-checkout';
  const found = await findAndMarkBest(page, {
    keywords: ['结算', '去结算'],
    attrName: checkoutAttr,
    textMaxLen: 30,
    childMaxLen: 30,
    excludeTexts: ['已售', '下架', '失效'],
    dismissOverlays: true,
  });

  if (found) {
    try {
      await page.locator(`[${checkoutAttr}="true"]`).first().click({ timeout: 3000 });
      await cleanupMarked(page, checkoutAttr);
      if (await verifyNav()) {
        const elapsed = Date.now() - tStart;
        console.log(`[browser] 已点击"结算" (mark+click) +${elapsed}ms`);
        writeSuccessLog(['checkout strategy: mark+click', `elapsed: ${elapsed}ms`, `url: ${page.url()}`]);
        return;
      }
      console.log('[browser] mark+click 点击后未跳转，继续...');
    } catch {
      await cleanupMarked(page, checkoutAttr);
    }
  }

  // Strategy 2: CSS selectors across all frames
  const checkoutSelector = selectors?.cart?.checkout_btn
    || '#J_Go, .go-btn, a[title="结算"], a[title="去结算"], .settlement-btn, .checkout-btn, .J_Go';
  for (const frame of frames) {
    try {
      const btn = frame.locator(checkoutSelector).first();
      await btn.waitFor({ state: 'visible', timeout: 2000 });
      await btn.click();
      if (await verifyNav()) {
        const elapsed = Date.now() - tStart;
        console.log(`[browser] 已点击"结算" (CSS) +${elapsed}ms`);
        writeSuccessLog(['checkout strategy: CSS', `elapsed: ${elapsed}ms`, `url: ${page.url()}`]);
        return;
      }
      console.log('[browser] CSS 点击后未跳转，继续...');
    } catch { /* try next frame */ }
  }

  // Strategy 3: Playwright text locator across all frames
  for (const kw of ['去结算', '结算']) {
    if (await tryClickInFrames(page, kw)) {
      if (await verifyNav()) {
        const elapsed = Date.now() - tStart;
        console.log(`[browser] 已点击"${kw}" (text) +${elapsed}ms`);
        writeSuccessLog(['checkout strategy: text', `keyword: ${kw}`, `elapsed: ${elapsed}ms`, `url: ${page.url()}`]);
        return;
      }
      console.log('[browser] 文本点击后未跳转，继续...');
    }
  }

  // Strategy 4: clickByText
  for (const kw of ['去结算', '结算']) {
    if (await clickByText(page, kw, false)) {
      if (await verifyNav()) {
        const elapsed = Date.now() - tStart;
        console.log(`[browser] 已点击"${kw}" (clickByText) +${elapsed}ms`);
        writeSuccessLog(['checkout strategy: clickByText', `keyword: ${kw}`, `elapsed: ${elapsed}ms`, `url: ${page.url()}`]);
        return;
      }
      console.log('[browser] clickByText 点击后未跳转，继续...');
    }
  }

  // Strategy 5: force-click across all frames (prefers innermost element = shortest text)
  console.log(`[browser] 前4种策略均失败 +${Date.now() - tStart}ms，尝试 force-click...`);
  for (const frame of frames) {
    try {
      await frame.evaluate(() => {
        const keywords = ['结算', '去结算'];
        const all = document.querySelectorAll('button, a, [role="button"], div');
        let best = null;
        let bestLen = Infinity;
        for (const el of all) {
          const t = (el.textContent || '').trim();
          if (t.length > 15) continue;
          for (const kw of keywords) {
            if (t.includes(kw) && t.length < bestLen) { best = el; bestLen = t.length; }
          }
        }
        if (best) best.setAttribute('data-tao-force', 'true');
      });
      const forceTargets = frame.locator('[data-tao-force="true"]');
      if ((await forceTargets.count()) > 0) {
        try {
          await forceTargets.first().click({ force: true, timeout: 2000, noWaitAfter: true });
          await frame.evaluate(() => document.querySelectorAll('[data-tao-force]').forEach(el => el.removeAttribute('data-tao-force')));
          if (await verifyNav()) {
            const elapsed = Date.now() - tStart;
            console.log(`[browser] 已点击"结算" (force-click) +${elapsed}ms`);
            writeSuccessLog(['checkout strategy: force-click', `elapsed: ${elapsed}ms`, `url: ${page.url()}`]);
            return;
          }
          console.log('[browser] force-click 点击后未跳转，继续...');
        } catch { /* try next */ }
        await frame.evaluate(() => document.querySelectorAll('[data-tao-force]').forEach(el => el.removeAttribute('data-tao-force')));
      }
    } catch { /* frame may be cross-origin, skip */ }
  }

  // All strategies failed — comprehensive diagnostics
  console.error('[browser] === 所有策略均失败，输出页面诊断 ===');
  const diagLines = [];
  diagLines.push(`当前URL: ${page.url()}`);
  diagLines.push(`Frame 数量: ${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    try { diagLines.push(`Frame ${i}: ${frames[i].url()}`); } catch { /* cross-origin */ }
  }

  // Search for settlement-related elements across ALL frames with detailed info
  for (let fi = 0; fi < frames.length; fi++) {
    try {
      const candidates = await frames[fi].evaluate(() => {
        const results = [];
        const keywords = ['结算', '去结算', '提交订单', '立即购买'];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const t = (el.textContent || '').trim();
          if (t.length > 50) continue;
          let matched = false;
          for (const kw of keywords) { if (t.includes(kw)) { matched = true; break; } }
          if (!matched) continue;
          const style = getComputedStyle(el);
          results.push({
            tag: el.tagName,
            text: t.substring(0, 40),
            class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 60) : '',
            id: el.id || '',
            display: style.display,
            visibility: style.visibility,
            position: style.position,
            rect: (() => { const r = el.getBoundingClientRect(); return `${r.x},${r.y} ${r.width}x${r.height}`; })(),
          });
          if (results.length >= 30) break;
        }
        return results;
      });
      if (candidates.length > 0) {
        diagLines.push(`Frame ${fi} 候选结算元素 (${candidates.length}):`);
        for (const c of candidates) {
          diagLines.push(`  <${c.tag}${c.id ? ' id=' + c.id : ''} class="${c.class}" pos="${c.position}" disp="${c.display}:${c.visibility}" rect="${c.rect}"> ${c.text}`);
        }
      }
    } catch { /* cross-origin */ }
  }

  try {
    const text = await page.evaluate(() => (document.body?.innerText || '').substring(0, 1200));
    diagLines.push(`页面全文:\n${text}`);
  } catch {
    diagLines.push('无法读取页面文本');
  }
  try {
    const ssPath = `/tmp/tao-cart-debug-${Date.now()}.png`;
    await page.screenshot({ path: ssPath, fullPage: true });
    diagLines.push(`截图: ${ssPath}`);
  } catch {
    diagLines.push('无法保存截图');
  }

  try {
    const logPath = writeDiagnostics('checkout-failure', diagLines);
    console.error(`[browser] 诊断日志已保存: ${logPath}`);
  } catch { /* logging failed */ }

  for (const line of diagLines) {
    console.error(`[browser] ${line}`);
  }

  throw new Error('未找到结算按钮——请确认购物车中有已勾选的商品，或使用 --interactive 模式手动勾选');
}

/**
 * Click the "立即购买" button on a product page using multiple fallback strategies.
 * Throws if no button can be found or clicked.
 */
async function clickBuyNowButton(page, selectors) {
  const buyBtnSelector = selectors?.product?.buy_now
    || '#J_LinkBuy, a[title="立即购买"], .tb-btn-buy a, .J_LinkBuy';

  const frames = page.frames();

  // Helper: after a click, verify we left the product page
  async function verifyNav() {
    await page.waitForTimeout(1500);
    const url = page.url();
    return !url.includes('item.taobao.com') && !url.includes('detail.tmall.com');
  }

  // Strategy 1: CSS selectors across all frames
  for (const frame of frames) {
    try {
      const btn = frame.locator(buyBtnSelector).first();
      await btn.waitFor({ state: 'visible', timeout: 2000 });
      await btn.click();
      if (await verifyNav()) { console.log('[browser] 已点击"立即购买" (CSS)'); return; }
      console.log('[browser] CSS 点击后未跳转，继续...');
    } catch { /* try next frame */ }
  }
  console.log('[browser] CSS 选择器在所有 frame 均未匹配，尝试文本搜索...');

  // Strategy 2: Playwright text locator across all frames
  if (await tryClickInFrames(page, '立即购买')) {
    if (await verifyNav()) { console.log('[browser] 已点击"立即购买" (text)'); return; }
    console.log('[browser] 文本点击后未跳转，继续...');
  }

  // Strategy 3: mark+click in main frame
  const buynowAttr = 'data-tao-buynow';
  const found = await findAndMarkBest(page, {
    keywords: ['立即购买'],
    attrName: buynowAttr,
    textMaxLen: 30,
    childMaxLen: 30,
  });

  if (found) {
    try {
      await page.locator(`[${buynowAttr}="true"]`).first().click({ timeout: 3000 });
      await cleanupMarked(page, buynowAttr);
      if (await verifyNav()) { console.log('[browser] 已点击"立即购买" (mark+click)'); return; }
      console.log('[browser] mark+click 点击后未跳转，继续...');
    } catch {
      await cleanupMarked(page, buynowAttr);
    }
  }

  // Strategy 4: clickByText
  if (await clickByText(page, '立即购买', false)) {
    if (await verifyNav()) { console.log('[browser] 已点击"立即购买" (clickByText)'); return; }
    console.log('[browser] clickByText 点击后未跳转，继续...');
  }

  // Strategy 5: force-click across all frames (prefers innermost element = shortest text)
  console.log('[browser] 常规策略均失败，尝试 force-click...');
  for (const frame of frames) {
    try {
      await frame.evaluate(() => {
        const all = document.querySelectorAll('button, a, [role="button"], div');
        let best = null;
        let bestLen = Infinity;
        for (const el of all) {
          const t = (el.textContent || '').trim();
          if (t.length > 15) continue;
          if (t.includes('立即购买') && t.length < bestLen) { best = el; bestLen = t.length; }
        }
        if (best) best.setAttribute('data-tao-force-buy', 'true');
      });
      const forceTargets = frame.locator('[data-tao-force-buy="true"]');
      if ((await forceTargets.count()) > 0) {
        try {
          await forceTargets.first().click({ force: true, timeout: 2000, noWaitAfter: true });
          await frame.evaluate(() => document.querySelectorAll('[data-tao-force-buy]').forEach(el => el.removeAttribute('data-tao-force-buy')));
          if (await verifyNav()) { console.log('[browser] 已点击"立即购买" (force-click)'); return; }
          console.log('[browser] force-click 点击后未跳转，继续...');
        } catch { /* try next */ }
        await frame.evaluate(() => document.querySelectorAll('[data-tao-force-buy]').forEach(el => el.removeAttribute('data-tao-force-buy')));
      }
    } catch { /* frame may be cross-origin, skip */ }
  }

  // All strategies failed — comprehensive diagnostics
  console.error('[browser] === 所有策略均失败，输出页面诊断 ===');
  const diagLines = [];
  diagLines.push(`当前URL: ${page.url()}`);
  diagLines.push(`Frame 数量: ${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    try { diagLines.push(`Frame ${i}: ${frames[i].url()}`); } catch { /* cross-origin */ }
  }
  try {
    const text = await page.evaluate(() => (document.body?.innerText || '').substring(0, 1200));
    diagLines.push(`页面全文:\n${text}`);
  } catch {
    diagLines.push('无法读取页面文本');
  }
  try {
    const ssPath = `/tmp/tao-buynow-debug-${Date.now()}.png`;
    await page.screenshot({ path: ssPath, fullPage: true });
    diagLines.push(`截图: ${ssPath}`);
  } catch {
    diagLines.push('无法保存截图');
  }

  try {
    const logPath = writeDiagnostics('buynow-failure', diagLines);
    console.error(`[browser] 诊断日志已保存: ${logPath}`);
  } catch { /* logging failed */ }

  for (const line of diagLines) {
    console.error(`[browser] ${line}`);
  }

  throw new Error('未找到"立即购买"按钮');
}

/**
 * Wait for user to press Enter in the terminal.
 */
function waitForEnter(prompt) {
  console.log(prompt);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', () => { rl.close(); resolve(); });
  });
}

/**
 * Navigate to cart page and select all items (does not click "结算").
 * If interactive is true, waits for user to manually select items and press Enter.
 */
async function navigateCart(page, selectors, interactive = false) {
  console.log(`[browser] 导航到购物车: ${CART_URL}`);
  await page.goto(CART_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Brief wait for initial render
  await page.waitForTimeout(2000);

  if (interactive) {
    await waitForEnter('[browser] 请在浏览器中勾选要购买的商品，完成后在终端按 Enter 继续...');
    console.log('[browser] 用户已确认，继续结算...');
    return;
  }

  // Wait for cart content to fully render (modern Taobao is SPA)
  try {
    await page.waitForSelector('.cart-container, .cart-main, #J_CartMain, .J_CartBody', { timeout: 10000 });
  } catch {
    console.log('[browser] 购物车页面可能未完全加载，继续尝试...');
  }
  await page.waitForTimeout(1000);

  // Automated mode: try multiple select-all strategies
  let selected = false;

  // Strategy 1: CSS selectors
  const selectAllSelector = selectors.cart?.select_all || '#J_SelectAll2, .cart-checkbox .all-check, input[name="selectAll"]';
  try {
    await page.locator(selectAllSelector).first().click({ timeout: 3000 });
    selected = true;
    console.log('[browser] 已全选购物车商品 (CSS)');
  } catch {
    console.log('[browser] CSS 选择器未匹配全选按钮，尝试 Playwright text...');
  }

  // Strategy 2: Playwright text locator (real mouse events)
  if (!selected) {
    try {
      await page.locator('text="全选"').first().click({ timeout: 3000 });
      selected = true;
      console.log('[browser] 已全选购物车商品 (PW text)');
    } catch {
      console.log('[browser] text="全选" 未匹配，尝试精确查找...');
    }
  }

  // Strategy 3: Mark element by text in JS, then click with Playwright
  if (!selected) {
    selected = await clickByText(page, '全选', true);
    if (selected) console.log('[browser] 已全选购物车商品 (mark+click)');
  }

  // Strategy 4: Try clicking individual item checkboxes
  if (!selected) {
    console.log('[browser] 全选按钮未找到，尝试逐个勾选商品...');
    try {
      const count = await page.evaluate(() => {
        const checkboxes = document.querySelectorAll(
          'input[type="checkbox"], .cart-checkbox input, .J_CartItemCheck, [class*="check"] input, [class*="CheckBox"] input'
        );
        let clicked = 0;
        for (const cb of checkboxes) {
          if (cb.checked) continue;
          cb.setAttribute('data-tao-item', 'true');
          clicked++;
        }
        return clicked;
      });
      if (count > 0) {
        const items = page.locator('[data-tao-item="true"]');
        const locatorCount = await items.count();
        for (let i = 0; i < locatorCount; i++) {
          try { await items.nth(i).click({ force: true, timeout: 1000 }); } catch { /* skip unclickable */ }
        }
        await page.evaluate(() => {
          document.querySelectorAll('[data-tao-item]').forEach(el => el.removeAttribute('data-tao-item'));
        });
        selected = true;
        console.log(`[browser] 已尝试勾选 ${count} 个商品`);
      }
    } catch {
      console.log('[browser] 逐个勾选也失败');
    }
    await page.waitForTimeout(500);
  }

  if (selected) {
    await page.waitForTimeout(800);
    console.log('[browser] 全选完成');
  } else {
    console.log('[browser] 自动全选失败——请使用 --interactive 模式手动勾选');
    // Dump page diagnostics for debugging
    const diagLines = [];
    diagLines.push(`当前URL: ${page.url()}`);
    try {
      const snippet = await page.evaluate(() => (document.body?.innerText || '').substring(0, 500));
      diagLines.push(`页面文本摘要:\n${snippet}`);
      console.log(`[browser] 页面文本摘要:\n${snippet}`);
      const screenshotPath = `/tmp/tao-cart-debug-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      diagLines.push(`截图: ${screenshotPath}`);
      console.log(`[browser] 截图已保存: ${screenshotPath}`);
    } catch { /* screenshot failed, continue */ }
    try {
      const logPath = writeDiagnostics('select-all-failure', diagLines);
      console.log(`[browser] 诊断日志已保存: ${logPath}`);
    } catch { /* logging failed */ }
  }
}

/**
 * Purchase via shopping cart.
 */
async function purchaseViaCart(context, config) {
  const page = await context.newPage();
  const selectors = getSelectors(config);
  const interactive = !!config.interactive;

  try {
    await navigateCart(page, selectors, interactive);

    console.log('[browser] 查找结算按钮...');
    await clickCheckoutButton(page, selectors);

    console.log('[browser] 等待跳转到确认页...');
    return page;
  } catch (err) {
    console.error(`[browser] 购物车操作失败: ${err.message}`);
    try {
      const url = page.url();
      console.error(`[browser] 当前页面: ${url}`);
      const snippet = await page.evaluate(() => (document.body?.innerText || '').substring(0, 400));
      console.error(`[browser] 页面内容预览: ${snippet}`);
    } catch {
      // page closed or navigated — can't log preview
    }
    await page.close();
    throw err;
  }
}

/**
 * Check the current page state to determine outcome.
 */
async function checkPageResult(page, config) {
  let url;
  try {
    url = page.url();
  } catch {
    // Page is navigating — context destroyed, retry
    return { success: false, retryable: true, reason: 'navigating' };
  }

  // Fast path: check URL first (no evaluate overhead)
  const successConf = (config.selectors && config.selectors.success) || {};
  const successUrls = successConf.url_patterns || ['trade.taobao.com', 'alipay.com'];
  for (const pattern of successUrls) {
    if (url.includes(pattern)) return { success: true };
  }

  // Terminal URL checks (no evaluate)
  if (url.includes('login.taobao.com')) {
    return { success: false, retryable: false, reason: 'login expired' };
  }

  // Text matching inside evaluate — returns short verdict, avoids serializing body text over IPC
  const successTexts = successConf.text_patterns || ['订单提交成功', '付款成功'];
  const terminalConf = (config.selectors && config.selectors.blocking && config.selectors.blocking.terminal) || {};
  const soldOutTexts = terminalConf.sold_out || ['已售罄', '卖完了', '库存不足', '已抢光'];
  const delistedTexts = terminalConf.delisted || ['商品已下架', '不存在', '已失效'];

  let verdict;
  try {
    verdict = await page.evaluate(
      ({ successTexts, soldOutTexts, delistedTexts }) => {
        const text = document.body?.innerText || '';
        for (const t of successTexts) { if (text.includes(t)) return 'success'; }
        for (const t of soldOutTexts) { if (text.includes(t)) return 'sold_out'; }
        for (const t of delistedTexts) { if (text.includes(t)) return 'delisted'; }
        if (text.includes('请登录')) return 'login_expired';
        return 'blocked';
      },
      { successTexts, soldOutTexts, delistedTexts }
    );
  } catch {
    // Page navigating — evaluate context destroyed, retry
    return { success: false, retryable: true, reason: 'navigating' };
  }

  if (verdict === 'success') return { success: true };
  if (verdict === 'sold_out') return { success: false, retryable: false, reason: 'sold out' };
  if (verdict === 'delisted') return { success: false, retryable: false, reason: 'delisted' };
  if (verdict === 'login_expired') return { success: false, retryable: false, reason: 'login expired' };
  return { success: false, retryable: true, reason: 'blocked' };
}

/**
 * Detect the submit-order button on the checkout page and return a durable
 * text-based CSS selector for rapid retry-clicking.
 *
 * Uses findAndMarkBest to locate the best "提交订单" element, extracts its
 * text, then returns a text-based selector (immune to React re-renders).
 */
async function detectSubmitButton(page, selectors) {
  await page.waitForTimeout(500);

  const attr = 'data-tao-submit';
  const textSelector = 'button:has-text("提交订单"), a:has-text("提交订单"), [role="button"]:has-text("提交订单")';

  // Use scoring system to verify the button exists
  const found = await findAndMarkBest(page, {
    keywords: ['提交订单'],
    attrName: attr,
    textMaxLen: 30,
    childMaxLen: 30,
  });

  if (found) {
    await cleanupMarked(page, attr);
    console.log('[browser] 提交订单按钮已检测');
    return textSelector;
  }

  // Fall back: search across all frames
  for (const frame of page.frames()) {
    try {
      const hasBtn = await frame.evaluate((a) => {
        const all = document.querySelectorAll('button, a, [role="button"], div');
        for (const el of all) {
          const t = (el.textContent || '').trim();
          if (t.includes('提交订单') && t.length <= 10) {
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            el.setAttribute(a, 'true');
            return true;
          }
        }
        return false;
      }, attr);
      if (hasBtn) {
        await frame.evaluate((a) => {
          const el = document.querySelector(`[${a}="true"]`);
          if (el) el.removeAttribute(a);
        }, attr);
        console.log('[browser] 在iframe中找到提交按钮');
        return textSelector;
      }
    } catch { /* cross-origin frame */ }
  }

  // Last resort: configured selectors
  const submitSelector = (selectors.checkout && selectors.checkout.submit_order)
    || '#J_Go, .go-btn a, button:has-text("提交订单")';
  console.log(`[browser] 未检测到提交按钮，使用配置选择器: ${submitSelector}`);
  return submitSelector;
}

/**
 * Wait for the checkout/order confirmation page to be ready.
 * Returns true if the page appears to be the checkout page.
 */
async function waitForCheckoutPage(page, selectors, timeoutMs = 15000) {
  const submitSelector = (selectors.checkout && selectors.checkout.submit_order) || '#J_Go';
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const url = page.url();

    // Already on a known checkout domain (Taobao + Tmall)
    if (url.includes('buy.taobao.com') || url.includes('buy.tmall.com') || url.includes('trade.taobao.com')) {
      // Wait for the submit button to render AND loading overlay to disappear.
      // Uses raf polling (~16ms) for minimal latency.
      try {
        await page.waitForFunction(
          () => {
            const text = document.body?.innerText || '';
            if (!text.includes('提交订单')) return false;
            if (text.includes('加载中')) return false;
            // Check for visible loading spinners/masks that don't have "加载中" text
            const spinners = document.querySelectorAll(
              '[class*="loading-mod"], [class*="Loading"], .next-feedback-loading, [aria-busy="true"]'
            );
            for (const el of spinners) {
              const s = getComputedStyle(el);
              if (s.display !== 'none' && s.visibility !== 'hidden') return false;
            }
            return true;
          },
          { polling: 'raf', timeout: Math.min(timeoutMs - (Date.now() - startTime), 8000) }
        );
        await page.waitForTimeout(50);
      } catch {
        // Timed out — return true anyway, retryLoop will handle it
      }
      return true;
    }

    // Check if we got redirected to login
    if (url.includes('login.taobao.com')) {
      return false;
    }

    // Check if submit button exists
    try {
      await page.waitForSelector(submitSelector, { timeout: 1000 });
      return true;
    } catch {
      // Not ready yet, keep waiting
    }

    await page.waitForTimeout(500);
  }

  return false;
}

async function logCheckoutFailure(page) {
  const url = page.url();
  const bodyText = await page.evaluate(() => (document.body?.innerText || '')).catch(() => '');
  let reason = 'did not reach checkout page';

  if (url.includes('login.taobao.com')) {
    reason = 'session expired — redirected to login';
    console.error(`[browser] ${reason}`);
  } else if (url.includes('cart.taobao.com')) {
    // Still on cart page — checkout button wasn't clicked
    reason = 'failed to click checkout button on cart page';
    console.error(`[browser] ${reason} (当前URL: ${url})`);
  } else if (bodyText.includes('卖完') || bodyText.includes('售罄') || bodyText.includes('库存不足') || bodyText.includes('已抢光')) {
    reason = 'item sold out';
    console.error(`[browser] ${reason}`);
  } else if (bodyText.includes('下架') || bodyText.includes('不存在') || bodyText.includes('已失效')) {
    reason = 'item delisted';
    console.error(`[browser] ${reason}`);
  } else if (bodyText.includes('请登录')) {
    reason = 'session expired';
    console.error(`[browser] ${reason}`);
  } else {
    console.error(`[browser] 未能到达确认订单页面 (当前URL: ${url})`);
  }

  return reason;
}

/**
 * Full browser purchase flow: navigate → buy → submit with retries.
 */
async function browserPurchase(config) {
  const { browser, context } = await createBrowser(config);

  try {
    const authed = await injectCookies(context, config.profile || 'default');
    if (!authed) {
      await browser.close();
      return { success: false, reason: 'no valid session' };
    }

    // Check if we should use cart flow or direct product page flow
    let page;
    if (config.useCart) {
      page = await purchaseViaCart(context, config);
    } else {
      page = await purchaseViaProductPage(context, config);
    }

    // Wait until the checkout page is actually loaded
    const selectors = getSelectors(config);
    const onCheckout = await waitForCheckoutPage(page, selectors);
    if (!onCheckout) {
      const reason = await logCheckoutFailure(page);
      await browser.close();
      return { success: false, reason };
    }

    return { success: true, page, browser, context };
  } catch (err) {
    console.error(`[browser] 浏览器流程失败: ${err.message}`);
    await browser.close();
    return { success: false, reason: err.message };
  }
}

/**
 * Create a dynamic submit-button clicker that re-detects the button on every
 * invocation using findAndMarkBest. This is immune to React re-renders because
 * the element is found fresh in the current DOM each time.
 *
 * Returns an async function suitable for use as retryClick's clickSelector.
 */
function createSubmitClicker(page) {
  const attr = 'data-tao-submit-dyn';
  return async () => {
    let found = false;
    try {
      found = await findAndMarkBest(page, {
        keywords: ['提交订单'],
        attrName: attr,
        textMaxLen: 30,
        childMaxLen: 30,
        dismissOverlays: true,
      });
    } catch {
      return;
    }

    if (!found) return;

    // Playwright real click (triggers React synthetic events reliably).
    // Overlays have been dismissed above, so the click lands on the button.
    try {
      await page.locator(`[${attr}="true"]`).first().click({ force: true, timeout: 2000, noWaitAfter: true });
    } catch {
      // Page may have navigated after click
    }
    // No cleanup needed — next findAndMarkBest call clears old marks via dismissOverlays
  };
}

module.exports = {
  createBrowser,
  injectCookies,
  navigateAndSelectSku,
  navigateCart,
  detectCheckoutButton,
  clickCheckoutButton,
  clickDetectedCheckoutButton,
  clickBuyNowButton,
  purchaseViaProductPage,
  purchaseViaCart,
  detectSubmitButton,
  createSubmitClicker,
  waitForCheckoutPage,
  logCheckoutFailure,
  checkPageResult,
  dismissDialogs,
  browserPurchase,
};
