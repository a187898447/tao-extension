import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';

// Use a temp directory to isolate test data
const tmpDir = path.join(fs.realpathSync(require('os').tmpdir()), `tao-int-test-${Date.now()}`);
const credentialsDir = path.join(tmpDir, '.taobao-tool', 'credentials');

// Monkey-patch os.homedir BEFORE any module imports
const origHomedir = require('os').homedir;
require('os').homedir = () => tmpDir;

// Save test session data before importing the module under test
fs.mkdirSync(credentialsDir, { recursive: true, mode: 0o700 });
const testCookies = [
  { name: '_tb_token_', value: 'real-token-123', domain: '.taobao.com' },
  { name: 'cookie2', value: 'real-cookie2-456', domain: '.taobao.com' },
  { name: 'unb', value: 'real-unb', domain: '.taobao.com' },
];
fs.writeFileSync(
  path.join(credentialsDir, 'default.json'),
  JSON.stringify({ profile: 'default', cookies: testCookies, savedAt: new Date().toISOString() }),
  { mode: 0o600 }
);

// Now import — the auth module's loadSession will find our test session
// buildOrderRequest uses the REAL loadSessionCookies (async)
const { buildOrderRequest } = await import('../../src/modes/api.js');

describe('API flow integration (real loadSessionCookies)', () => {
  afterAll(() => {
    require('os').homedir = origHomedir;
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('buildOrderRequest works with real async loadSessionCookies (no mock)', async () => {
    const template = {
      url: 'https://buy.taobao.com/submitOrder',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      postData: 'itemId=12345&quantity=1',
    };

    // No third param — uses real loadSessionCookies
    const result = await buildOrderRequest(template, { profile: 'default' });

    expect(result).not.toBeNull();
    expect(result.url).toBe('https://buy.taobao.com/submitOrder');
    expect(result.method).toBe('POST');
    expect(result.headers.Cookie).toContain('_tb_token_=real-token-123');
    expect(result.headers.Cookie).toContain('cookie2=real-cookie2-456');
  });
});
