const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.taobao-tool', 'logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
  }
}

function logFile(name) {
  ensureLogDir();
  return path.join(LOG_DIR, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
}

function writeDiagnostics(name, lines) {
  const filePath = logFile(name);
  const header = `=== ${name} — ${new Date().toISOString()} ===\n`;
  const content = header + lines.join('\n') + '\n';
  fs.appendFileSync(filePath, content, 'utf-8');
  return filePath;
}

function writeSuccessLog(lines) {
  return writeDiagnostics('success', lines);
}

module.exports = { writeDiagnostics, writeSuccessLog };
