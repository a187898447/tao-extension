const { chromium } = require('playwright');
const { loadSessionCookies } = require('../shared/auth');

const CART_URL = 'https://cart.taobao.com/cart.htm';

function getSelectors(config) {
  return config.selectors || {};
}

/**
 * Launch browser with stealth configuration and inject saved session cookies.
 */
async function createBrowser(config) {
  const browser = await chromium.launch({
    headless: config.headless || false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-features=TranslateUI',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'zh-CN',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  return { browser, context };
}

async function injectCookies(context, profile) {
  const cookies = loadSessionCookies(profile);
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
      // Try to find and click the option by text or data attribute
      const clicked = await page.evaluate(
        (valQuery) => {
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
                item.click();
              }
              return true;
            }
          }
          return false;
        },
        value
      );

      if (clicked) {
        console.log(`[browser] SKU 已选择: ${value}`);
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

    // Click "立即购买" button
    const buyBtnSelector = selectors.buy_now || '#J_LinkBuy';
    console.log(`[browser] 点击"立即购买"`);
    await page.click(buyBtnSelector);
    console.log(`[browser] 已点击"立即购买"，等待跳转到确认页...`);

    return page;
  } catch (err) {
    console.error(`[browser] 商品页操作失败: ${err.message}`);
    await page.close();
    throw err;
  }
}

/**
 * Navigate to cart page and select all items (does not click "结算").
 */
async function navigateCart(page, selectors) {
  console.log(`[browser] 导航到购物车: ${CART_URL}`);
  await page.goto(CART_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Select all items
  const selectAllSelector = selectors.cart?.select_all || '#J_SelectAll2';
  try {
    await page.click(selectAllSelector);
    console.log('[browser] 已全选购物车商品');
  } catch {
    console.log('[browser] 全选按钮未找到，尝试直接结算');
  }
  await page.waitForTimeout(500);
}

/**
 * Purchase via shopping cart.
 */
async function purchaseViaCart(context, config) {
  const page = await context.newPage();
  const selectors = getSelectors(config);

  try {
    await navigateCart(page, selectors);

    // Click checkout button
    const checkoutSelector = selectors.cart?.checkout_btn || '#J_Go';
    console.log('[browser] 点击"结算"');
    await page.click(checkoutSelector);
    console.log('[browser] 已点击"结算"，等待跳转到确认页...');

    return page;
  } catch (err) {
    console.error(`[browser] 购物车操作失败: ${err.message}`);
    await page.close();
    throw err;
  }
}

/**
 * Check the current page state to determine outcome.
 */
async function checkPageResult(page, config) {
  const url = page.url();
  const bodyText = await page.evaluate(() => document.body?.innerText || '');

  // Check success
  const successConf = (config.selectors && config.selectors.success) || {};
  const successUrls = successConf.url_patterns || ['trade.taobao.com', 'alipay.com'];
  const successTexts = successConf.text_patterns || ['订单提交成功', '付款成功'];

  for (const pattern of successUrls) {
    if (url.includes(pattern)) return { success: true };
  }
  for (const pattern of successTexts) {
    if (bodyText.includes(pattern)) return { success: true };
  }

  // Check terminal errors - sold out
  const terminalTexts = (config.selectors && config.selectors.blocking && config.selectors.blocking.terminal) || {};
  const soldOutTexts = terminalTexts.sold_out || ['已售罄', '卖完了', '库存不足', '已抢光'];
  for (const text of soldOutTexts) {
    if (bodyText.includes(text)) {
      return { success: false, retryable: false, reason: `sold out: ${text}` };
    }
  }

  // Check terminal errors - delisted
  const delistedTexts = terminalTexts.delisted || ['商品已下架', '不存在', '已失效'];
  for (const text of delistedTexts) {
    if (bodyText.includes(text)) {
      return { success: false, retryable: false, reason: `delisted: ${text}` };
    }
  }

  // Check login expired
  if (url.includes('login.taobao.com') || bodyText.includes('请登录')) {
    return { success: false, retryable: false, reason: 'login expired' };
  }

  // Any other response → retryable
  return { success: false, retryable: true, reason: 'blocked' };
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

    // Already on a known checkout domain
    if (url.includes('buy.taobao.com') || url.includes('trade.taobao.com')) {
      // Brief wait for page render
      await page.waitForTimeout(500);
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
  if (url.includes('login.taobao.com')) {
    console.error('[browser] 会话已过期，请重新登录');
  }
  const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  if (bodyText.includes('卖完') || bodyText.includes('售罄')) {
    console.error('[browser] 商品已售罄');
  }
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
      console.error('[browser] 未能到达确认订单页面');
      await logCheckoutFailure(page);
      await browser.close();
      return { success: false, reason: 'did not reach checkout page' };
    }

    return { success: true, page, browser, context };
  } catch (err) {
    console.error(`[browser] 浏览器流程失败: ${err.message}`);
    await browser.close();
    return { success: false, reason: err.message };
  }
}

module.exports = {
  createBrowser,
  injectCookies,
  navigateAndSelectSku,
  navigateCart,
  purchaseViaProductPage,
  purchaseViaCart,
  waitForCheckoutPage,
  logCheckoutFailure,
  checkPageResult,
  browserPurchase,
};
