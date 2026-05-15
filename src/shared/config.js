const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.taobao-tool');
const DEFAULT_CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, 'config.yaml');
const PROJECT_CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

const DEFAULTS = {
  mode: 'browser',
  retryInterval: 100,
  retryWindow: 30000,
  profile: 'default',
  headless: false,
  capture: false,
  leadTime: 10000, // browser mode lead time before target (ms)
  checkoutLead: 1000, // ms — click checkout this many ms before target time
};

function loadProjectConfig(filename) {
  const filePath = path.join(PROJECT_CONFIG_DIR, filename);
  if (!fs.existsSync(filePath)) return {};
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function loadUserConfig() {
  if (!fs.existsSync(DEFAULT_CONFIG_FILE)) return {};
  try {
    return YAML.parse(fs.readFileSync(DEFAULT_CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

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
    if (!isNaN(rw)) merged.retryWindow = rw * 1000; // CLI accepts seconds, store as ms
  }
  if (cliOptions.profile !== undefined) merged.profile = cliOptions.profile;
  if (cliOptions.useCart !== undefined) merged.useCart = cliOptions.useCart;
  if (cliOptions.interactive !== undefined) merged.interactive = cliOptions.interactive;
  if (cliOptions.headless !== undefined) merged.headless = cliOptions.headless;
  if (cliOptions.capture !== undefined) merged.capture = cliOptions.capture;
  if (cliOptions.productUrl) merged.productUrl = cliOptions.productUrl;
  if (cliOptions.sku) merged.sku = cliOptions.sku;
  if (cliOptions.apiTemplate) merged.apiTemplate = cliOptions.apiTemplate;
  if (cliOptions.checkoutLead !== undefined) {
    const cl = parseInt(cliOptions.checkoutLead, 10);
    if (!isNaN(cl)) merged.checkoutLead = cl;
  }

  return merged;
}

function getConfig(cliOptions = {}) {
  const projectConfig = loadProjectConfig('selectors.yaml');
  const userConfig = loadUserConfig();

  // Merge user config with project config sections
  const merged = mergeConfig(
    { ...userConfig, selectors: projectConfig },
    cliOptions
  );

  return merged;
}

module.exports = { getConfig };
