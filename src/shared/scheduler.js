const axios = require('axios');
const { sleep } = require('./retry');

/**
 * Fetch Taobao server time once, returning { offset, rtt }.
 * Positive offset = server is ahead of local.
 */
async function fetchTimeOnce() {
  const start = Date.now();
  const resp = await axios.get('https://m.taobao.com', {
    timeout: 8000,
    validateStatus: () => true,
    maxRedirects: 0,
  });
  const end = Date.now();
  const serverDate = resp.headers['date'];
  if (!serverDate) return null;
  const serverMs = new Date(serverDate).getTime();
  if (isNaN(serverMs)) return null;
  const rtt = end - start;
  const midpoint = (start + end) / 2;
  return { offset: Math.round(serverMs - midpoint), rtt };
}

/**
 * Sample server time multiple times, pick the one with the lowest RTT.
 * Returns the offset from local time (ms). Positive = server ahead.
 */
async function syncTaobaoTime() {
  try {
    const samples = 3;
    const results = [];
    for (let i = 0; i < samples; i++) {
      const r = await fetchTimeOnce();
      if (r) results.push(r);
      if (i < samples - 1) await sleep(200);
    }
    if (results.length === 0) {
      console.log('[schedule] 无法获取淘宝服务器时间，使用本地时间');
      return 0;
    }
    const best = results.reduce((a, b) => (a.rtt < b.rtt ? a : b));
    const sign = best.offset > 0 ? '+' : '';
    console.log(`[schedule] 淘宝服务器时间偏移: ${sign}${best.offset}ms (RTT: ${best.rtt}ms, ${results.length}/${samples}次采样取最优)`);
    return best.offset;
  } catch {
    console.log('[schedule] 无法获取淘宝服务器时间，使用本地时间');
  }
  return 0;
}

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
 * @param {Function} prepare - Async function called at (target - leadTimeMs), or immediately if prepareImmediately
 * @param {Function} execute - Async function called exactly at target time
 * @param {number} timeOffset - Server time offset (ms), positive = server ahead
 * @param {boolean} prepareImmediately - Skip countdown, call prepare right away (for interactive mode)
 * @returns {Promise<any>} - The result of execute()
 */
async function schedulePurchase({ targetTime, leadTimeMs, prepare, execute, timeOffset = 0, prepareImmediately = false, advanceMs = 0 }) {
  const targetMs = targetTime.getTime();

  // serverNow = local time + offset (offset > 0 means server is ahead)
  function serverNow() { return Date.now() + timeOffset; }

  // Validate using server-adjusted time
  if (targetMs <= serverNow()) {
    throw new Error('目标时间已过，请检查时间设置');
  }

  if (timeOffset !== 0) {
    console.log(`[schedule] 使用淘宝服务器时间 (偏移 ${timeOffset > 0 ? '+' : ''}${timeOffset}ms)`);
  }

  if (!prepareImmediately) {
    const leadTime = leadTimeMs || 5000;
    const prepareAt = targetMs - leadTime;

    // Calculate wait time using server-adjusted clock
    let waitMs = prepareAt - serverNow();

    if (waitMs > 0) {
      console.log(`[schedule] 目标时间: ${targetTime.toLocaleString()}`);
      console.log(`[schedule] 将在 ${new Date(prepareAt).toLocaleString()} 开始准备`);
      console.log(`[schedule] 等待中...`);

      // Countdown loop
      while (serverNow() < prepareAt) {
        const remaining = Math.max(0, prepareAt - serverNow());
        process.stdout.write(
          `\r[schedule] 距离准备阶段: ${formatDuration(remaining)}  `);
        await sleep(Math.min(1000, remaining));
      }
      console.log();
    }
  } else {
    console.log(`[schedule] 交互模式 — 立即启动准备阶段`);
    console.log(`[schedule] 目标时间: ${targetTime.toLocaleString()}`);
  }

  // Preparation phase
  console.log('[schedule] 开始准备...');
  const prepareResult = await prepare();

  // After preparation, verify target hasn't passed
  const remainingUntilTarget = targetMs - serverNow();
  if (remainingUntilTarget < 0) {
    throw new Error('目标时间在准备阶段已过，请提前启动');
  }

  // Calculate execute time: advanceMs before target (e.g., 1000ms early for checkout)
  const executeAt = targetMs - advanceMs;
  const remainingUntilExecute = executeAt - serverNow();

  if (remainingUntilExecute > 0) {
    const label = advanceMs > 0
      ? `准备完成，距提前执行: ${formatDuration(remainingUntilExecute)} (目标时间前${advanceMs}ms)`
      : `准备完成，距目标时间: ${formatDuration(remainingUntilExecute)}`;
    console.log(`[schedule] ${label}`);

    // Fine-grained waiting
    while (serverNow() < executeAt) {
      const remaining = executeAt - serverNow();
      if (remaining <= 50) {
        // Spin-wait for last 50ms for precision
        while (serverNow() < executeAt);
        break;
      }
      process.stdout.write(
        `\r[schedule] 倒计时: ${formatDuration(remaining)}  `);
      await sleep(Math.min(100, remaining - 5));
    }
    console.log();
  }

  // Execute (advanceMs before target, or exactly at target if advanceMs=0)
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
  syncTaobaoTime,
  parseTargetTime,
  schedulePurchase,
};
