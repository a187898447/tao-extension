const fs = require('fs');
const path = require('path');
const os = require('os');
const YAML = require('yaml');

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.taobao-tool');
const DEFAULT_CONFIG_FILE = path.join(DEFAULT_CONFIG_DIR, 'config.yaml');
const PROJECT_CONFIG_DIR = path.join(__dirname, '..', '..', 'config');

const DEFAULTS = {
  mode: 'browser',
  retryInterval: 200,
  retryWindow: 30000,
  profile: 'default',
  headless: false,
  capture: false,
  leadTime: 10000, // browser mode lead time before target (ms)
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

  // Only override with CLI options when user explicitly set them
  // (i.e., the value differs from DEFAULTS — Commander's default doesn't count)
  if (cliOptions.mode && cliOptions.mode !== DEFAULTS.mode) {
    merged.mode = cliOptions.mode;
  }
  const ri = parseInt(cliOptions.retryInterval, 10);
  if (!isNaN(ri) && ri !== DEFAULTS.retryInterval) {
    merged.retryInterval = ri;
  }
  const rw = parseInt(cliOptions.retryWindow, 10);
  if (!isNaN(rw) && rw !== DEFAULTS.retryWindow / 1000) {
    merged.retryWindow = rw * 1000; // CLI accepts seconds, store as ms
  }
  if (cliOptions.profile && cliOptions.profile !== DEFAULTS.profile) {
    merged.profile = cliOptions.profile;
  }
  if (cliOptions.useCart !== undefined) merged.useCart = cliOptions.useCart;
  if (cliOptions.headless !== undefined) merged.headless = cliOptions.headless;
  if (cliOptions.capture !== undefined) merged.capture = cliOptions.capture;
  if (cliOptions.productUrl) merged.productUrl = cliOptions.productUrl;
  if (cliOptions.sku) merged.sku = cliOptions.sku;

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
