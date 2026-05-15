/**
 * Rapid retry / "brainless clicking" engine.
 *
 * Clicks the target button at a fixed interval within a time window,
 * without checking DOM state between clicks.
 * Exits on: success, terminal error, login expired, or window timeout.
 */

/**
 * Execute a retryable action in a rapid loop.
 *
 * @param {Object} options
 * @param {number} options.interval    - Delay between attempts (ms), default 200
 * @param {number} options.window      - Total time window (ms), default 30000
 * @param {Function} options.attempt   - Async function for one attempt.
 *                                       Returns { success, retryable?, reason? }
 * @returns {Promise<{success: boolean, attempts: number, reason?: string}>}
 */
async function retryLoop(options = {}) {
  const interval = options.interval || 200;
  const windowMs = options.window || 30000;
  const attemptFn = options.attempt;

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < windowMs) {
    attempts++;

    try {
      const result = await attemptFn();

      if (result.success) {
        console.log(`[retry] 第 ${attempts} 次尝试成功！`);
        return { success: true, attempts };
      }

      // Terminal error → stop immediately
      if (result.retryable === false) {
        console.log(`[retry] 第 ${attempts} 次尝试，终局错误: ${result.reason}`);
        return { success: false, attempts, reason: result.reason };
      }

      // Retryable → continue
      const elapsed = Date.now() - startTime;
      if (elapsed + interval < windowMs) {
        await sleep(interval);
      }
    } catch (err) {
      // Unexpected error during attempt → stop
      console.error(`[retry] 第 ${attempts} 次尝试异常: ${err.message}`);
      return { success: false, attempts, reason: `error: ${err.message}` };
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[retry] 时间窗口已过期 (${elapsed}ms), 共 ${attempts} 次尝试`);
  return { success: false, attempts, reason: 'time window expired' };
}

/**
 * Browser-mode retry: repeatedly click and check result.
 *
 * @param {import('playwright').Page} page
 * @param {Object} config
 * @param {Function} checkFn - function(page, config) => { success, retryable?, reason? }
 * @param {string|Function} clickSelector - CSS selector string, or an async function
 *   that performs the click (for dynamic per-attempt element detection).
 * @returns {Promise<import('playwright').Page>} - the page (may have navigated)
 */
async function retryClick(page, config, checkFn, clickSelector) {
  const interval = config.retryInterval || 200;
  const windowMs = config.retryWindow || 30000;
  const t0 = Date.now();
  const dynamicClicker = typeof clickSelector === 'function' ? clickSelector : null;

  let clickFailedLogged = false;

  const result = await retryLoop({
    interval,
    window: windowMs,
    async attempt() {
      // Dynamic clicker: re-detects the button on every attempt (immune to React re-renders)
      if (dynamicClicker) {
        try {
          await dynamicClicker();
          await page.waitForTimeout(15);
        } catch (err) {
          // Navigation / context-destroyed errors are normal (order submitted → redirect)
          if (!clickFailedLogged && !err.message.includes('Execution context was destroyed')
              && !err.message.includes('Target page, context or browser has been closed')) {
            console.log(`[retry] 动态点击失败: ${err.message.substring(0, 100)}`);
            clickFailedLogged = true;
          }
        }
      } else {
        // Static selector: straightforward Playwright click
        try {
          await page.click(clickSelector, { force: true, noWaitAfter: true, timeout: 500 });
          await page.waitForTimeout(50);
        } catch (err) {
          if (!clickFailedLogged) {
            console.log(`[retry] 点击 ${clickSelector} 失败: ${err.message.substring(0, 100)}`);
            clickFailedLogged = true;
          }
        }
      }

      try {
        return await checkFn(page, config);
      } catch (err) {
        // Page may be navigating (order submitted → redirect), treat as retryable
        return { success: false, retryable: true, reason: `check error (retryable): ${err.message}` };
      }
    },
  });

  result.elapsed = Date.now() - t0;
  result.attemptsPerSec = result.elapsed > 0
    ? (result.attempts / (result.elapsed / 1000)).toFixed(1) : '0';
  console.log(`[retry] ${result.success ? '成功' : '失败'} | 总耗时:${result.elapsed}ms 尝试:${result.attempts} (${result.attemptsPerSec}次/秒)`);
  return result;
}

/**
 * API-mode retry: repeatedly send an HTTP request and check result.
 *
 * @param {Function} requestFn - async () => axios response
 * @param {Object} config
 * @param {Function} checkFn - (response) => { success, retryable?, reason? }
 * @returns {Promise<{success: boolean, attempts: number, reason?: string}>}
 */
async function retryApi(requestFn, config, checkFn) {
  // API mode enforces 100ms minimum interval
  const interval = Math.max(config.retryInterval || 200, 100);
  if (config.retryInterval && config.retryInterval < 100) {
    console.log(`[retry] API模式最小间隔为 100ms，已将 ${config.retryInterval}ms 调整为 100ms`);
  }
  const windowMs = config.retryWindow || 30000;

  return retryLoop({
    interval,
    window: windowMs,
    async attempt() {
      const response = await requestFn();
      return checkFn(response);
    },
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  retryClick,
  retryApi,
  sleep,
};
