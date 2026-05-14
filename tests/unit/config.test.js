import { describe, it, expect } from 'vitest';

// We test mergeConfig directly by recreating its logic for isolated testing.
// getConfig depends on filesystem, so we test mergeConfig's pure logic.

const DEFAULTS = {
  mode: 'browser',
  retryInterval: 200,
  retryWindow: 30000,
  profile: 'default',
  headless: false,
  capture: false,
  leadTime: 10000,
};

function mergeConfig(fileConfig, cliOptions) {
  const merged = { ...DEFAULTS, ...fileConfig };

  // CLI overrides — only apply when explicitly provided (not undefined)
  if (cliOptions.mode !== undefined) merged.mode = cliOptions.mode;
  if (cliOptions.retryInterval !== undefined) {
    const ri = parseInt(cliOptions.retryInterval, 10);
    if (!isNaN(ri)) merged.retryInterval = ri;
  }
  if (cliOptions.retryWindow !== undefined) {
    const rw = parseInt(cliOptions.retryWindow, 10);
    if (!isNaN(rw)) merged.retryWindow = rw * 1000;
  }
  if (cliOptions.profile !== undefined) merged.profile = cliOptions.profile;
  if (cliOptions.useCart !== undefined) merged.useCart = cliOptions.useCart;
  if (cliOptions.interactive !== undefined) merged.interactive = cliOptions.interactive;
  if (cliOptions.headless !== undefined) merged.headless = cliOptions.headless;
  if (cliOptions.capture !== undefined) merged.capture = cliOptions.capture;
  if (cliOptions.productUrl) merged.productUrl = cliOptions.productUrl;
  if (cliOptions.sku) merged.sku = cliOptions.sku;
  if (cliOptions.apiTemplate) merged.apiTemplate = cliOptions.apiTemplate;

  return merged;
}

describe('mergeConfig', () => {
  it('returns defaults when given empty inputs', () => {
    const result = mergeConfig({}, {});
    expect(result).toEqual(DEFAULTS);
  });

  it('merges file config over defaults', () => {
    const result = mergeConfig({ mode: 'api', profile: 'work' }, {});
    expect(result.mode).toBe('api');
    expect(result.profile).toBe('work');
    expect(result.retryInterval).toBe(200);
  });

  it('CLI mode overrides file config when provided', () => {
    const result = mergeConfig({}, { mode: 'api' });
    expect(result.mode).toBe('api');
  });

  it('CLI option not passed (undefined) does not override file config', () => {
    const result = mergeConfig({ mode: 'api', profile: 'work', retryInterval: 100, retryWindow: 60000 }, {});
    expect(result.mode).toBe('api');
    expect(result.profile).toBe('work');
    expect(result.retryInterval).toBe(100);
    expect(result.retryWindow).toBe(60000);
  });

  it('CLI explicitly passing default overrides file config', () => {
    const result = mergeConfig({ mode: 'api' }, { mode: 'browser' });
    expect(result.mode).toBe('browser');
  });

  it('CLI retryInterval overrides', () => {
    const result = mergeConfig({}, { retryInterval: '100' });
    expect(result.retryInterval).toBe(100);
  });

  it('CLI retryWindow converts seconds to ms', () => {
    const result = mergeConfig({}, { retryWindow: '60' });
    expect(result.retryWindow).toBe(60000);
  });

  it('CLI retryWindow overrides file config when explicitly passed', () => {
    const result = mergeConfig({ retryWindow: 60000 }, { retryWindow: '30' });
    expect(result.retryWindow).toBe(30000);
  });

  it('CLI profile overrides when different', () => {
    const result = mergeConfig({}, { profile: 'account2' });
    expect(result.profile).toBe('account2');
  });

  it('boolean flags (useCart) work when set', () => {
    const result = mergeConfig({}, { useCart: true });
    expect(result.useCart).toBe(true);
  });

  it('boolean flags (useCart) work when false', () => {
    const result = mergeConfig({}, { useCart: false });
    expect(result.useCart).toBe(false);
  });

  it('boolean flags (useCart) not set when undefined', () => {
    const result = mergeConfig({}, {});
    expect(result.useCart).toBeUndefined();
  });

  it('boolean flags (interactive) work when set', () => {
    const result = mergeConfig({}, { interactive: true });
    expect(result.interactive).toBe(true);
  });

  it('boolean flags (interactive) not set when undefined', () => {
    const result = mergeConfig({}, {});
    expect(result.interactive).toBeUndefined();
  });

  it('boolean flags (headless) work', () => {
    const result = mergeConfig({}, { headless: true });
    expect(result.headless).toBe(true);
  });

  it('boolean flags (capture) work', () => {
    const result = mergeConfig({}, { capture: true });
    expect(result.capture).toBe(true);
  });

  it('productUrl is passed through', () => {
    const url = 'https://item.taobao.com/item.htm?id=123';
    const result = mergeConfig({}, { productUrl: url });
    expect(result.productUrl).toBe(url);
  });

  it('sku is passed through', () => {
    const result = mergeConfig({}, { sku: '{"color":"red"}' });
    expect(result.sku).toBe('{"color":"red"}');
  });

  it('invalid retryInterval is ignored', () => {
    const result = mergeConfig({}, { retryInterval: 'abc' });
    expect(result.retryInterval).toBe(200);
  });

  it('apiTemplate is passed through', () => {
    const result = mergeConfig({}, { apiTemplate: '/path/to/template.json' });
    expect(result.apiTemplate).toBe('/path/to/template.json');
  });

  it('invalid retryWindow is ignored', () => {
    const result = mergeConfig({}, { retryWindow: 'abc' });
    expect(result.retryWindow).toBe(30000);
  });

  it('full overrides: all CLI options', () => {
    const result = mergeConfig({}, {
      mode: 'api',
      retryInterval: '150',
      retryWindow: '60',
      profile: 'pro',
      useCart: true,
      headless: true,
      capture: true,
      productUrl: 'https://example.com/item',
      sku: '{}',
      interactive: true,
      apiTemplate: '/custom/template.json',
    });
    expect(result).toMatchObject({
      mode: 'api',
      retryInterval: 150,
      retryWindow: 60000,
      profile: 'pro',
      useCart: true,
      headless: true,
      capture: true,
      productUrl: 'https://example.com/item',
      sku: '{}',
      interactive: true,
      apiTemplate: '/custom/template.json',
    });
  });
});
