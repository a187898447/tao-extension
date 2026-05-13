const { chromium } = require('playwright');
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

async function launchLoginBrowser(headless) {
  const browser = await chromium.launch({
    headless,
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

  // Override navigator.webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  return { browser, context };
}

async function login(profile, headless = false) {
  console.log(`[auth] 启动浏览器，请在浏览器中手动登录淘宝账号...`);
  console.log(`[auth] 支持扫码登录或账号密码登录，包括验证码验证`);
  console.log(`[auth] 登录超时时间: ${LOGIN_TIMEOUT_MS / 60000} 分钟`);

  const { browser, context } = await launchLoginBrowser(headless);

  try {
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    const startTime = Date.now();

    // Poll for auth cookies
    while (Date.now() - startTime < LOGIN_TIMEOUT_MS) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
      const cookies = await context.cookies();

      if (cookiesContainAuth(cookies)) {
        // Brief wait to ensure all cookies are set
        await page.waitForTimeout(3000);
        const finalCookies = await context.cookies();
        saveSession(profile, finalCookies);
        console.log(`[auth] 登录成功！凭证已保存到 profile: '${profile}'`);
        console.log(`[auth] cookies 数量: ${finalCookies.length}`);
        return { success: true, cookies: finalCookies };
      }
    }

    console.error(`[auth] 登录超时 (${LOGIN_TIMEOUT_MS / 60000} 分钟)`);
    return { success: false, reason: 'timeout' };
  } finally {
    await browser.close();
  }
}

async function checkSession(profile) {
  const axios = require('axios');

  if (!sessionExists(profile)) {
    return { valid: false, reason: 'no session file' };
  }

  const session = loadSession(profile);
  if (!session.cookies || session.cookies.length === 0) {
    return { valid: false, reason: 'empty cookies' };
  }

  // Make a lightweight authenticated request to check session
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
      maxRedirects: 5,
      timeout: 15000,
      validateStatus: () => true,
    });

    // If redirected to login page, session is invalid
    if (resp.request._redirectCount > 0) {
      const finalUrl = resp.request.res.responseUrl || '';
      if (finalUrl.includes('login.taobao.com')) {
        return { valid: false, reason: 'redirected to login' };
      }
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
