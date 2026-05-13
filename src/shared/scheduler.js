const { sleep } = require('./retry');

/**
 * Parse a time string into a Date object.
 * Supports formats: "YYYY-MM-DD HH:mm:ss", "HH:mm:ss" (today)
 */
function parseTargetTime(timeStr) {
  if (!timeStr) return null;

  // Try full datetime
  let parsed = new Date(timeStr);
  if (!isNaN(parsed.getTime())) return parsed;

  // Try "YYYY-MM-DD HH:mm:ss" format (replace space with T for ISO)
  parsed = new Date(timeStr.replace(' ', 'T'));
  if (!isNaN(parsed.getTime())) return parsed;

  // Try "HH:mm:ss" (use today)
  const today = new Date();
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (timeMatch) {
    today.setHours(parseInt(timeMatch[1], 10));
    today.setMinutes(parseInt(timeMatch[2], 10));
    today.setSeconds(parseInt(timeMatch[3], 10));
    today.setMilliseconds(0);
    return today;
  }

  return null;
}

/**
 * Wait until the target time and then execute a callback.
 * Displays countdown while waiting.
 *
 * @param {Date} targetTime
 * @param {number} leadTimeMs - How many ms before target to start preparation
 * @param {Function} prepare - Async function called at (target - leadTimeMs)
 * @param {Function} execute - Async function called exactly at target time
 * @returns {Promise<any>} - The result of execute()
 */
async function schedulePurchase({ targetTime, leadTimeMs, prepare, execute }) {
  const targetMs = targetTime.getTime();

  // Validate
  if (targetMs <= Date.now()) {
    throw new Error('目标时间已过，请检查时间设置');
  }

  const leadTime = leadTimeMs || 5000;
  const prepareAt = targetMs - leadTime;

  // Calculate wait time
  let waitMs = prepareAt - Date.now();

  if (waitMs > 0) {
    console.log(`[schedule] 目标时间: ${targetTime.toLocaleString()}`);
    console.log(`[schedule] 将在 ${new Date(prepareAt).toLocaleString()} 开始准备`);
    console.log(`[schedule] 等待中...`);

    // Countdown loop
    while (Date.now() < prepareAt) {
      const remaining = Math.max(0, prepareAt - Date.now());
      process.stdout.write(
        `\r[schedule] 距离准备阶段: ${formatDuration(remaining)}  `);
      await sleep(Math.min(1000, remaining));
    }
    console.log();
  }

  // Preparation phase
  console.log('[schedule] 开始准备...');
  const prepareResult = await prepare();

  // Wait exactly until target time, then execute
  const remainingUntilTarget = targetMs - Date.now();
  if (remainingUntilTarget > 0) {
    console.log(
      `[schedule] 准备完成，距目标时间: ${formatDuration(remainingUntilTarget)}`
    );

    // Fine-grained waiting for the last few seconds
    while (Date.now() < targetMs) {
      const remaining = targetMs - Date.now();
      if (remaining <= 50) {
        // Spin-wait for last 50ms for precision
        while (Date.now() < targetMs);
        break;
      }
      process.stdout.write(
        `\r[schedule] 倒计时: ${formatDuration(remaining)}  `);
      await sleep(Math.min(100, remaining - 5));
    }
    console.log();
  }

  // Execute at target time
  console.log('[schedule] 触发！执行购买...');
  const result = await execute(prepareResult);

  return result;
}

function formatDuration(ms) {
  if (ms < 0) return '0s';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) {
    return `${min}m${sec.toString().padStart(2, '0')}s`;
  }
  return `${sec}s`;
}

module.exports = {
  parseTargetTime,
  schedulePurchase,
};
