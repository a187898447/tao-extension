const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadSessionCookies } = require('../shared/auth');
const { retryApi } = require('../shared/retry');

const CAPTURE_DIR = path.join(os.homedir(), '.taobao-tool', 'captures');

/**
 * Set up Playwright network interception to capture order-related requests.
 */
function setupNetworkCapture(page, captureFile) {
  const capturedRequests = [];

  page.on('request', (request) => {
    const url = request.url();
    const method = request.method();
    // Capture all Taobao/Tmall/Alipay POSTs + any order-path requests
    const isTaobaoDomain = url.includes('.taobao.com') || url.includes('.tmall.com');
    const isAlipayDomain = url.includes('.alipay.com');
    const isOrderPath = url.includes('/order/') || url.includes('/trade/')
      || url.includes('submitOrder') || url.includes('createOrder')
      || url.includes('confirm') || url.includes('buy.');
    if (
      (isTaobaoDomain && (method === 'POST' || isOrderPath)) ||
      (isAlipayDomain && method === 'POST') ||
      isOrderPath
    ) {
      capturedRequests.push({
        url: request.url(),
        method,
        headers: request.headers(),
        postData: request.postData(),
        timestamp: Date.now(),
      });
    }
  });

  page.on('response', async (response) => {
    const request = response.request();
    const url = request.url();

    // Find matching captured request and add response data
    const captured = capturedRequests.find(r => r.url === url && !r.responseStatus);
    if (captured) {
      captured.responseStatus = response.status();
      captured.responseHeaders = response.headers();
      try {
        captured.responseBody = await response.text();
        // Truncate long bodies
        if (captured.responseBody.length > 5000) {
          captured.responseBody = captured.responseBody.substring(0, 5000) + '...[truncated]';
        }
      } catch {
        captured.responseBody = '[unable to read]';
      }
    }
  });

  return {
    getRequests: () => capturedRequests,
    save: () => {
      if (!fs.existsSync(CAPTURE_DIR)) {
        fs.mkdirSync(CAPTURE_DIR, { recursive: true, mode: 0o700 });
      }
      const file = captureFile || path.join(CAPTURE_DIR, `capture-${Date.now()}.json`);
      fs.writeFileSync(file, JSON.stringify(capturedRequests, null, 2), { mode: 0o600 });
      console.log(`[api] 抓包数据已保存到: ${file}`);
      console.log(`[api] 共捕获 ${capturedRequests.length} 个请求`);
      return file;
    },
  };
}

/**
 * Load saved capture data or API template from config.
 */
function loadApiTemplate(templatePath) {
  if (templatePath && fs.existsSync(templatePath)) {
    try { return JSON.parse(fs.readFileSync(templatePath, 'utf-8')); } catch { return null; }
  }
  // Try default captures
  if (fs.existsSync(CAPTURE_DIR)) {
    const files = fs.readdirSync(CAPTURE_DIR).filter(f => f.endsWith('.json')).sort();
    if (files.length > 0) {
      const latest = path.join(CAPTURE_DIR, files[files.length - 1]);
      try { return JSON.parse(fs.readFileSync(latest, 'utf-8')); } catch { return null; }
    }
  }
  return null;
}

/**
 * Find the order submission request from captured data.
 */
function findOrderRequest(capturedData) {
  if (!Array.isArray(capturedData)) return null;

  // Priority order: submit → create → confirm → buy
  const keywords = ['submitOrder', 'createOrder', 'confirm', '.buy.', 'trade'];
  for (const kw of keywords) {
    const match = capturedData.find(
      r => r.url.includes(kw) && r.method === 'POST'
    );
    if (match) return match;
  }

  // Fallback: first POST request
  return capturedData.find(r => r.method === 'POST') || null;
}

/**
 * Build order request from template and config.
 */
async function buildOrderRequest(template, config, getCookies) {
  if (!template) return null;

  const fetchCookies = getCookies || loadSessionCookies;
  const cookies = await fetchCookies(config.profile || 'default');
  if (!cookies) return null;

  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Use the captured request as a template
  const headers = { ...template.headers };
  // Update with current cookies
  headers.Cookie = cookieHeader;
  // Remove host-specific headers that axios will set
  delete headers['content-length'];
  delete headers['content-encoding'];
  delete headers.Host;
  delete headers.Connection;

  let body = template.postData;
  // Try to parse and merge with config
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (config.itemId) parsed.itemId = config.itemId;
      if (config.skuId) parsed.skuId = config.skuId;
      if (config.quantity) parsed.quantity = config.quantity;
      body = JSON.stringify(parsed);
    } catch {
      // Keep body as-is if not JSON
    }
  }

  return {
    url: template.url,
    method: template.method || 'POST',
    headers,
    data: body,
  };
}

/**
 * Execute API-based purchase with retry.
 */
async function apiPurchase(config) {
  const template = config.apiTemplate ? loadApiTemplate(config.apiTemplate) : loadApiTemplate();

  if (!template) {
    console.error('[api] 未找到API抓包数据。请先用浏览器模式运行一次购买 (tao buy)，或使用 --capture 参数捕获请求');
    return { success: false, reason: 'no api template data' };
  }

  const orderTemplate = findOrderRequest(template);
  if (!orderTemplate) {
    console.error('[api] 未能从抓包数据中找到下单请求');
    return { success: false, reason: 'no order request found in capture' };
  }

  console.log(`[api] 使用下单接口: ${orderTemplate.url}`);

  const requestConfig = await buildOrderRequest(orderTemplate, config);
  if (!requestConfig) {
    return { success: false, reason: 'failed to build request' };
  }

  const instance = axios.create({
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://buy.taobao.com/',
    },
  });

  return retryApi(
    () => instance.request({
      url: requestConfig.url,
      method: requestConfig.method,
      headers: requestConfig.headers,
      data: requestConfig.data,
    }),
    config,
    (response) => {
      const status = response.status;
      const data = response.data;

      // Success: usually 200 with success message
      if (status === 200) {
        const text = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
        if (text.includes('success') || text.includes('成功') || text.includes('订单')) {
          return { success: true };
        }
        if (text.includes('售罄') || text.includes('卖完') || text.includes('库存')) {
          return { success: false, retryable: false, reason: 'sold out' };
        }
        if (text.includes('登录') || text.includes('session')) {
          return { success: false, retryable: false, reason: 'auth expired' };
        }
        // Unknown 200 → assume retryable
        return { success: false, retryable: true, reason: 'unknown response' };
      }

      // 4xx, 5xx → retryable
      return { success: false, retryable: true, reason: `HTTP ${status}` };
    }
  );
}

module.exports = {
  setupNetworkCapture,
  loadApiTemplate,
  findOrderRequest,
  buildOrderRequest,
  apiPurchase,
};
