import { describe, it, expect } from 'vitest';
import { checkPageResult } from '../../src/modes/browser.js';

function mockPage(url, bodyText) {
  return {
    url: () => url,
    evaluate: async () => bodyText,
  };
}

function mockConfig(overrides = {}) {
  return { selectors: overrides };
}

describe('checkPageResult', () => {
  describe('success detection', () => {
    it('detects success via trade.taobao.com URL', async () => {
      const page = mockPage('https://trade.taobao.com/trade/detail.htm', '');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(true);
    });

    it('detects success via alipay.com URL', async () => {
      const page = mockPage('https://www.alipay.com/cashier/pay.htm', '');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(true);
    });

    it('detects success via text pattern "订单提交成功"', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '订单提交成功，请尽快付款');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(true);
    });

    it('detects success via text pattern "付款成功"', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '付款成功！');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(true);
    });

    it('detects success via text pattern "感谢购买" with custom config', async () => {
      const config = { selectors: { success: { text_patterns: ['感谢购买'] } } };
      const page = mockPage('https://buy.taobao.com/checkout', '感谢购买');
      const result = await checkPageResult(page, config);
      expect(result.success).toBe(true);
    });

    it('uses custom success URL patterns from config', async () => {
      const config = { selectors: { success: { url_patterns: ['pay.example.com'] } } };
      const page = mockPage('https://pay.example.com/thanks', '');
      const result = await checkPageResult(page, config);
      expect(result.success).toBe(true);
    });

    it('uses custom success text patterns from config', async () => {
      const config = { selectors: { success: { text_patterns: ['支付完成'] } } };
      const page = mockPage('https://x.com/order', '您的订单支付完成');
      const result = await checkPageResult(page, config);
      expect(result.success).toBe(true);
    });
  });

  describe('terminal error detection', () => {
    it('detects sold out', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '该商品已售罄');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toContain('sold out');
    });

    it('detects 卖完了', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '卖完了，下次再来');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toContain('sold out');
    });

    it('detects 库存不足', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '库存不足');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toContain('sold out');
    });

    it('detects 已抢光', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '已抢光');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toContain('sold out');
    });

    it('detects delisted: 商品已下架', async () => {
      const page = mockPage('https://item.taobao.com/item.htm', '该商品已下架');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toContain('delisted');
    });

    it('detects delisted: 不存在', async () => {
      const page = mockPage('https://item.taobao.com/item.htm', '商品不存在');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toContain('delisted');
    });

    it('detects login expired via URL', async () => {
      const page = mockPage('https://login.taobao.com/member/login.jhtml', '');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toBe('login expired');
    });

    it('detects login expired via body text', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '请登录后再操作');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toBe('login expired');
    });

    it('uses custom terminal texts from config', async () => {
      const config = {
        selectors: {
          blocking: {
            terminal: {
              sold_out: ['抢光了', '已下架'],
              delisted: ['页面不存在'],
            },
          },
        },
      };
      const page = mockPage('https://buy.taobao.com', '该宝贝抢光了');
      const result = await checkPageResult(page, config);
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.reason).toContain('sold out');
    });
  });

  describe('retryable (neither success nor terminal)', () => {
    it('returns retryable for unknown page content', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '提交订单');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      expect(result.reason).toBe('blocked');
    });

    it('returns retryable on checkout page without success text', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '确认订单信息，请提交');
      const result = await checkPageResult(page, mockConfig());
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty body text', async () => {
      const page = mockPage('https://buy.taobao.com/checkout', '');
      const result = await checkPageResult(page, mockConfig());
      expect(result.retryable).toBe(true);
    });

    it('handles null config.selectors gracefully', async () => {
      const page = mockPage('https://trade.taobao.com/trade/detail.htm', '');
      const result = await checkPageResult(page, {});
      expect(result.success).toBe(true);
    });
  });
});
