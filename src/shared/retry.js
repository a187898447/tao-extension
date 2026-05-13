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
 * Browser-mode retry: repeatedly click a selector and check page result.
 *
 * @param {import('playwright').Page} page
 * @param {Object} config
 * @param {Function} checkFn - function(page, config) => { success, retryable?, reason? }
 * @param {string} clickSelector - CSS selector for the button to click
 * @returns {Promise<import('playwright').Page>} - the page (may have navigated)
 */
async function retryClick(page, config, checkFn, clickSelector) {
  const interval = config.retryInterval || 200;
  const windowMs = config.retryWindow || 30000;

  const result = await retryLoop({
    interval,
    window: windowMs,
    async attempt() {
      // Use force:true — brainless clicking, don't check actionability.
      // If the button doesn't exist or is hidden, this click is a harmless no-op.
      try {
        await page.click(clickSelector, { force: true, noWaitAfter: true, timeout: 500 });
        await page.waitForTimeout(50);
      } catch {
        // Click may have failed because page navigated — check result anyway
      }
      return checkFn(page, config);
    },
  });

  console.log(`[retry] 完成: ${result.success ? '成功' : '失败'}, 尝试次数: ${result.attempts}`);
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
