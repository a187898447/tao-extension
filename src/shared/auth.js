const axios = require('axios');
const readline = require('readline');
const { createBrowser } = require('./browser-launcher');
const { saveSession, loadSession, sessionExists } = require('./session');

const LOGIN_URL = 'https://login.taobao.com/member/login.jhtml';
const TAOBAO_URL = 'https://www.taobao.com';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000; // 2 seconds

// Known Taobao auth cookies present after login
const AUTH_COOKIE_NAMES = ['_tb_token_', 'cookie2', 'unb'];

function cookiesContainAuth(cookies) {
  const names = new Set(cookies.map(c => c.name));
  return AUTH_COOKIE_NAMES.some(n => names.has(n));
}

function isLoggedIn(url) {
  return !url.includes('login.taobao.com');
}

async function login(profile, headless = false, keepOpen = false) {
  console.log(`[auth] 启动浏览器，请在浏览器中手动登录淘宝账号...`);
  console.log(`[auth] 支持扫码登录或账号密码登录，包括验证码验证`);
  console.log(`[auth] 登录超时时间: ${LOGIN_TIMEOUT_MS / 60000} 分钟`);

  const { browser, context } = await createBrowser({ headless });

  try {
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    const startTime = Date.now();

    // Poll for login completion (page redirects away from login URL)
    while (Date.now() - startTime < LOGIN_TIMEOUT_MS) {
      await page.waitForTimeout(POLL_INTERVAL_MS);

      if (isLoggedIn(page.url())) {
        // Wait for post-redirect cookies to settle
        await page.waitForTimeout(3000);
        const finalCookies = await context.cookies();

        // Double-check: must have auth cookies
        if (!cookiesContainAuth(finalCookies)) {
          console.log('[auth] 页面已跳转但未检测到认证 cookie，继续等待...');
          continue;
        }

        saveSession(profile, finalCookies);
        console.log(`[auth] 登录成功！凭证已保存到 profile: '${profile}'`);
        console.log(`[auth] cookies 数量: ${finalCookies.length}`);

        if (keepOpen) {
          console.log('[auth] 浏览器保持打开，你可以去购物车勾选商品');
          console.log('[auth] 完成后按 Enter 键退出（购物车勾选状态已同步到服务器，新浏览器会继承）');
          // Wait for user to press Enter in the terminal
          await new Promise((resolve) => {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            rl.on('line', () => {
              rl.close();
              resolve();
            });
          });
        }

        return { success: true, cookies: finalCookies };
      }
    }

    console.error(`[auth] 登录超时 (${LOGIN_TIMEOUT_MS / 60000} 分钟)`);
    return { success: false, reason: 'timeout' };
  } finally {
    if (!keepOpen) {
      await browser.close();
    }
  }
}

async function checkSession(profile) {
  if (!sessionExists(profile)) {
    return { valid: false, reason: 'no session file' };
  }

  const session = loadSession(profile);
  if (!session.cookies || session.cookies.length === 0) {
    return { valid: false, reason: 'empty cookies' };
  }

  const cookieHeader = session.cookies
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const resp = await axios.get(TAOBAO_URL, {
      headers: {
        Cookie: cookieHeader,
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      maxRedirects: 0,
      timeout: 15000,
      validateStatus: () => true,
    });

    // Check if we're being redirected to the login page
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.location || '';
      if (location.includes('login.taobao.com')) {
        return { valid: false, reason: 'redirected to login' };
      }
      // Non-login redirect (risk control / CDN / region) — can't verify session
      if (location) {
        return { valid: false, reason: `unexpected redirect to ${location}` };
      }
      return { valid: false, reason: 'unexpected redirect with no location header' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `network error: ${err.message}` };
  }
}

async function loadSessionCookies(profile) {
  const session = loadSession(profile);
  if (!session) return null;
  return session.cookies;
}

module.exports = {
  login,
  checkSession,
  loadSessionCookies,
};
