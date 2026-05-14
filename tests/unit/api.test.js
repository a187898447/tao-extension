import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { loadApiTemplate, findOrderRequest, buildOrderRequest } from '../../src/modes/api.js';

// Helper: async getCookies matching real loadSessionCookies signature
async function mockGetCookies(profile) {
  if (profile === 'noauth') return null;
  return [
    { name: '_tb_token_', value: 'mock-token' },
    { name: 'cookie2', value: 'mock-cookie2' },
  ];
}

describe('findOrderRequest', () => {
  it('returns null for non-array input', () => {
    expect(findOrderRequest(null)).toBeNull();
    expect(findOrderRequest(undefined)).toBeNull();
    expect(findOrderRequest({})).toBeNull();
    expect(findOrderRequest('string')).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(findOrderRequest([])).toBeNull();
  });

  it('finds POST request matching submitOrder first', () => {
    const data = [
      { url: 'https://example.com/page', method: 'GET' },
      { url: 'https://buy.taobao.com/submitOrder', method: 'POST', headers: {} },
      { url: 'https://buy.taobao.com/createOrder', method: 'POST', headers: {} },
    ];
    const result = findOrderRequest(data);
    expect(result.url).toContain('submitOrder');
  });

  it('finds createOrder if no submitOrder', () => {
    const data = [
      { url: 'https://example.com/page', method: 'GET' },
      { url: 'https://buy.taobao.com/createOrder', method: 'POST', headers: {} },
    ];
    const result = findOrderRequest(data);
    expect(result.url).toContain('createOrder');
  });

  it('finds trade-related POST', () => {
    const data = [
      { url: 'https://example.com/page', method: 'GET' },
      { url: 'https://trade.taobao.com/confirm', method: 'POST', headers: {} },
    ];
    const result = findOrderRequest(data);
    expect(result.url).toContain('trade');
  });

  it('fallbacks to first POST request', () => {
    const data = [
      { url: 'https://example.com/api/data', method: 'POST', headers: {} },
      { url: 'https://example.com/page', method: 'GET' },
    ];
    const result = findOrderRequest(data);
    expect(result.url).toBe('https://example.com/api/data');
  });

  it('returns null when no POST requests exist', () => {
    const data = [
      { url: 'https://example.com/page1', method: 'GET' },
      { url: 'https://example.com/page2', method: 'GET' },
    ];
    expect(findOrderRequest(data)).toBeNull();
  });

  it('ignores GET requests with matching keywords', () => {
    const data = [
      { url: 'https://buy.taobao.com/submitOrder', method: 'GET' },
      { url: 'https://buy.taobao.com/createOrder', method: 'GET' },
    ];
    expect(findOrderRequest(data)).toBeNull();
  });
});

describe('buildOrderRequest', () => {
  it('returns null when template is null', async () => {
    const result = await buildOrderRequest(null, { profile: 'default' }, mockGetCookies);
    expect(result).toBeNull();
  });

  it('returns null when cookies are not available', async () => {
    const template = { url: 'https://example.com/order', method: 'POST', headers: {} };
    const result = await buildOrderRequest(template, { profile: 'noauth' }, mockGetCookies);
    expect(result).toBeNull();
  });

  it('builds request with cookie header from session', async () => {
    const template = {
      url: 'https://buy.taobao.com/submitOrder',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      postData: '{"itemId":"123"}',
    };
    const result = await buildOrderRequest(template, { profile: 'default' }, mockGetCookies);

    expect(result).not.toBeNull();
    expect(result.url).toBe('https://buy.taobao.com/submitOrder');
    expect(result.method).toBe('POST');
    expect(result.headers.Cookie).toContain('_tb_token_=mock-token');
    expect(result.headers.Cookie).toContain('cookie2=mock-cookie2');
    expect(result.headers['Content-Type']).toBe('application/json');
  });

  it('removes hop-by-hop headers', async () => {
    const template = {
      url: 'https://example.com/order',
      method: 'POST',
      headers: {
        Host: 'buy.taobao.com',
        Connection: 'keep-alive',
        'content-length': '1234',
        'content-encoding': 'gzip',
        'Content-Type': 'application/json',
      },
      postData: null,
    };
    const result = await buildOrderRequest(template, { profile: 'default' }, mockGetCookies);

    expect(result.headers.Host).toBeUndefined();
    expect(result.headers.Connection).toBeUndefined();
    expect(result.headers['content-length']).toBeUndefined();
    expect(result.headers['content-encoding']).toBeUndefined();
    expect(result.headers['Content-Type']).toBe('application/json');
  });

  it('merges config itemId into JSON body', async () => {
    const template = {
      url: 'https://example.com/order',
      method: 'POST',
      headers: {},
      postData: '{"itemId":"old123","quantity":1}',
    };
    const result = await buildOrderRequest(template, {
      profile: 'default',
      itemId: 'new456',
      quantity: 5,
    }, mockGetCookies);

    const parsed = JSON.parse(result.data);
    expect(parsed.itemId).toBe('new456');
    expect(parsed.quantity).toBe(5);
  });

  it('keeps non-JSON body as-is', async () => {
    const template = {
      url: 'https://example.com/order',
      method: 'POST',
      headers: {},
      postData: 'plain=text&data=here',
    };
    const result = await buildOrderRequest(template, {
      profile: 'default',
      itemId: '123',
    }, mockGetCookies);

    expect(result.data).toBe('plain=text&data=here');
  });
});

describe('loadApiTemplate', () => {
  const tmpDir = path.join(os.tmpdir(), `tao-api-test-${Date.now()}`);

  beforeEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loads from specified template path', () => {
    const templatePath = path.join(tmpDir, 'capture.json');
    fs.mkdirSync(tmpDir, { recursive: true });
    const data = [{ url: 'https://example.com/order', method: 'POST' }];
    fs.writeFileSync(templatePath, JSON.stringify(data));

    const result = loadApiTemplate(templatePath);
    expect(result).toEqual(data);
  });

  it('returns null when specified path does not exist', () => {
    const result = loadApiTemplate('/nonexistent/path/capture.json');
    expect(result).toBeNull();
  });

  it('returns null for corrupt JSON at specified path', () => {
    const templatePath = path.join(tmpDir, 'corrupt.json');
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(templatePath, 'not valid{{{');

    const result = loadApiTemplate(templatePath);
    expect(result).toBeNull();
  });
});
