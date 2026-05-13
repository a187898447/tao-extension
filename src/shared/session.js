const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDENTIALS_DIR = path.join(os.homedir(), '.taobao-tool', 'credentials');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function getProfilePath(profile) {
  ensureDir(CREDENTIALS_DIR);
  return path.join(CREDENTIALS_DIR, `${profile}.json`);
}

function saveSession(profile, cookies) {
  const filePath = getProfilePath(profile);
  const data = {
    profile,
    cookies,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function loadSession(profile) {
  const filePath = getProfilePath(profile);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function sessionExists(profile) {
  return fs.existsSync(getProfilePath(profile));
}

module.exports = {
  saveSession,
  loadSession,
  sessionExists,
};
