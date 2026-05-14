#!/usr/bin/env node

const { program } = require('commander');
const { login, checkSession } = require('./shared/auth');
const { getConfig } = require('./shared/config');
const { retryClick } = require('./shared/retry');
const { createBrowser, injectCookies, navigateAndSelectSku, navigateCart, detectCheckoutButton, waitForCheckoutPage, logCheckoutFailure, browserPurchase, checkPageResult, clickCheckoutButton, clickBuyNowButton, clickDetectedCheckoutButton, createSubmitClicker } = require('./modes/browser');
const { setupNetworkCapture, apiPurchase, loadApiTemplate } = require('./modes/api');
const { syncTaobaoTime, parseTargetTime, schedulePurchase } = require('./shared/scheduler');

program.name('tao').description('淘宝抢购自动化工具').version('1.0.0');

// --- login command ---
program
  .command('login')
  .description('登录淘宝账号并保存凭证')
  .option('-p, --profile <name>', '凭证 profile 名称 (默认 default)')
  .option('--headless', '无头模式运行浏览器')
  .option('--keep-open', '登录后保持浏览器打开，方便手动操作（如勾选购物车）')
  .action(async (opts) => {
    const profile = opts.profile || 'default';
    const result = await login(profile, !!opts.headless, !!opts.keepOpen);
    if (!result.success) process.exit(1);
  });

// --- status command ---
program
  .command('status')
  .description('查看登录状态')
  .option('-p, --profile <name>', '凭证 profile 名称 (默认 default)')
  .action(async (opts) => {
    const profile = opts.profile || 'default';
    console.log(`检查 profile '${profile}' 的登录状态...`);
    const result = await checkSession(profile);
    if (result.valid) {
      console.log(`[status] profile '${profile}' 登录状态: 有效`);
    } else {
      console.log(`[status] profile '${profile}' 登录状态: 无效 (${result.reason})`);
      console.log(`[status] 请运行 tao login 重新登录`);
    }
  });

// --- buy command ---
program
  .command('buy')
  .description('执行购买（浏览器模式或API模式）')
  .option('-m, --mode <mode>', '模式: browser 或 api (默认 browser)')
  .option('-u, --product-url <url>', '商品详情页 URL')
  .option('--use-cart', '使用购物车结算')
  .option('--sku <json>', 'SKU 选择，如 {"颜色":"红色","尺码":"XL"}')
  .option('-p, --profile <name>', '凭证 profile 名称 (默认 default)')
  .option('--retry-interval <ms>', '重试间隔(毫秒)，默认200')
  .option('--retry-window <seconds>', '重试时间窗口(秒)，默认30')
  .option('--capture', '启用网络请求抓包')
  .option('--api-template <path>', 'API模板文件路径')
  .option('--headless', '无头模式运行浏览器')
  .option('--interactive', '购物车模式下手动勾选商品，按 Enter 继续')
  .action(async (opts) => {
    const config = getConfig({
      ...opts,
      useCart: opts.useCart,
      interactive: opts.interactive,
    });

    if (config.mode === 'api') {
      console.log('[tao] API 模式购买...');
      const result = await apiPurchase(config);
      if (result.success) {
        console.log(`[tao] 购买成功！尝试次数: ${result.attempts}`);
      } else {
        console.error(`[tao] 购买失败: ${result.reason}, 尝试次数: ${result.attempts}`);
        process.exit(1);
      }
      return;
    }

    // Browser mode
    console.log('[tao] 浏览器模式购买...');
    if (!config.useCart && !config.productUrl) {
      console.error('[tao] 非购物车模式需要提供 --product-url');
      process.exit(1);
    }

    const result = await browserPurchase(config);
    if (!result.success) {
      console.error(`[tao] 浏览器流程失败: ${result.reason}`);
      process.exit(1);
    }

    const { page, browser } = result;

    // Set up network capture if requested
    let capture = null;
    if (config.capture) {
      capture = setupNetworkCapture(page);
    }

    // Dynamic submit clicker — re-detects button on every attempt (immune to React re-renders)
    const submitClicker = createSubmitClicker(page);

    let retryResult;
    try {
      console.log('[tao] 进入重试循环，动态检测并点击提交订单...');
      retryResult = await retryClick(page, config, checkPageResult, submitClicker);

      // Save capture data if enabled
      if (capture) {
        capture.save();
      }
    } finally {
      await browser.close();
    }

    // Report result
    if (retryResult.success) {
      console.log(`[tao] 购买成功！尝试次数: ${retryResult.attempts}`);
    } else {
      console.error(`[tao] 购买失败: ${retryResult.reason}, 尝试次数: ${retryResult.attempts}`);
    }

    if (!retryResult.success) process.exit(1);
  });

// --- schedule command ---
program
  .command('schedule')
  .description('定时抢购')
  .option('-m, --mode <mode>', '模式: browser 或 api (默认 browser)')
  .option('-u, --product-url <url>', '商品详情页 URL')
  .option('--use-cart', '使用购物车结算')
  .option('--sku <json>', 'SKU 选择')
  .option('--at <time>', '目标时间，格式: "YYYY-MM-DD HH:mm:ss" 或 "HH:mm:ss"')
  .option('-p, --profile <name>', '凭证 profile 名称 (默认 default)')
  .option('--retry-interval <ms>', '重试间隔(毫秒)，默认200')
  .option('--retry-window <seconds>', '重试时间窗口(秒)，默认30')
  .option('--capture', '启用网络请求抓包')
  .option('--api-template <path>', 'API模板文件路径')
  .option('--headless', '无头模式运行浏览器')
  .option('--interactive', '购物车模式下手动勾选商品，按 Enter 继续')
  .option('--checkout-lead <ms>', '结算按钮提前点击时间(毫秒)，默认1000')
  .action(async (opts) => {
    if (!opts.at) {
      console.error('[tao] schedule 需要 --at 参数指定目标时间');
      process.exit(1);
    }

    const targetTime = parseTargetTime(opts.at);
    if (!targetTime) {
      console.error(`[tao] 无法解析目标时间: ${opts.at}`);
      console.error('[tao] 支持格式: "YYYY-MM-DD HH:mm:ss" 或 "HH:mm:ss"');
      process.exit(1);
    }

    const config = getConfig({
      ...opts,
      useCart: opts.useCart,
      interactive: opts.interactive,
    });

    console.log(`[tao] 定时抢购模式，目标时间: ${targetTime.toLocaleString()}`);
    console.log(`[tao] 模式: ${config.mode}, profile: ${config.profile}`);

    // Sync with Taobao server time before countdown
    console.log('[tao] 同步淘宝服务器时间...');
    const timeOffset = await syncTaobaoTime();

    // Browser mode needs time to launch + navigate + select SKU/cart items + detect button
    // API mode only needs to validate template (sub-second)
    const leadTime = config.leadTime || (config.mode === 'browser' ? 10000 : 1000);
    // Interactive cart mode: skip countdown, open browser immediately for manual selection
    const prepareImmediately = !!(config.useCart && config.interactive);

    const checkoutLead = config.checkoutLead || 1000;

    try {
      await schedulePurchase({
        targetTime,
        leadTimeMs: leadTime,
        timeOffset,
        prepareImmediately,
        advanceMs: checkoutLead,
        prepare: async () => {
          if (config.mode === 'browser') {
            if (!config.productUrl && !config.useCart) {
              throw new Error('浏览器模式需要提供 --product-url');
            }
            const { browser, context } = await createBrowser(config);
            try {
              const authed = await injectCookies(context, config.profile || 'default');
              if (!authed) {
                await browser.close();
                throw new Error('no valid session');
              }
              const page = await context.newPage();
              const allSelectors = config.selectors || {};
              if (config.useCart) {
                await navigateCart(page, allSelectors, !!config.interactive);
                // Pre-detect checkout button so it's confirmed ready before target time
                const btnReady = await detectCheckoutButton(page, allSelectors);
                if (!btnReady) {
                  console.log('[tao] 结算按钮未就绪，将在执行阶段重试查找...');
                }
              } else {
                const productSelectors = allSelectors.product || {};
                const skuOptions = config.sku
                  ? (typeof config.sku === 'string' ? JSON.parse(config.sku) : config.sku)
                  : null;
                await navigateAndSelectSku(page, config.productUrl, skuOptions, productSelectors);
              }
              console.log('[tao] 准备阶段完成，等待目标时间...');
              return { page, browser, context };
            } catch (err) {
              await browser.close();
              throw err;
            }
          }
          // For API mode, validate the template exists before waiting
          const template = loadApiTemplate(config.apiTemplate);
          if (!template) {
            throw new Error('API模板数据不存在，请先用 tao buy --capture 抓包');
          }
          return { config, template };
        },
        execute: async (prepResult) => {
          if (config.mode === 'browser') {
            const { page, browser } = prepResult;
            const allSelectors = config.selectors || {};

            // Click the appropriate button to reach checkout at target time.
            // For cart mode: use pre-detected button (fast, no strategy search).
            // For product mode: run full strategy search since we didn't pre-detect.
            if (config.useCart) {
              console.log('[browser] 点击"结算"');
              await clickDetectedCheckoutButton(page, allSelectors);
            } else {
              console.log('[browser] 点击"立即购买"');
              await clickBuyNowButton(page, allSelectors);
            }
            console.log('[browser] 已点击，等待跳转到确认页...');

            // Wait for checkout page
            const onCheckout = await waitForCheckoutPage(page, allSelectors);
            if (!onCheckout) {
              console.error('[browser] 未能到达确认订单页面');
              await logCheckoutFailure(page);
              await browser.close();
              return { success: false, reason: 'did not reach checkout page' };
            }

            let capture = null;
            if (config.capture) {
              capture = setupNetworkCapture(page);
            }

            const submitClicker = createSubmitClicker(page);

            console.log('[tao] 进入重试循环，动态检测并点击提交订单...');
            let retryResult;
            try {
              retryResult = await retryClick(page, config, checkPageResult, submitClicker);
              if (capture) capture.save();
            } finally {
              await browser.close();
            }

            if (retryResult.success) {
              console.log(`[tao] 购买成功！尝试次数: ${retryResult.attempts}`);
            } else {
              console.error(`[tao] 购买失败: ${retryResult.reason}, 尝试次数: ${retryResult.attempts}`);
            }
            return retryResult;
          }

          // API mode
          const apiResult = await apiPurchase(config);
          if (apiResult.success) {
            console.log(`[tao] 购买成功！尝试次数: ${apiResult.attempts}`);
          } else {
            console.error(`[tao] 购买失败: ${apiResult.reason}, 尝试次数: ${apiResult.attempts}`);
          }
          return apiResult;
        },
      });

      console.log('[tao] 定时抢购完成');
    } catch (err) {
      console.error(`[tao] 定时抢购失败: ${err.message}`);
      process.exit(1);
    }
  });

process.on('unhandledRejection', (err) => {
  console.error(`[tao] 未捕获的错误: ${err.message}`);
  process.exit(1);
});

program.parse(process.argv);
