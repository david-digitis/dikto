const fs = require('fs');
const path = require('path');

// In packaged app, write logs to userData (AppImage is read-only)
let logFile;
try {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  logFile = path.join(userDataPath, 'debug.log');
} catch {
  // Fallback for non-Electron context (e.g. test scripts)
  logFile = path.join(__dirname, '..', 'debug.log');
}

// Clear log on start
fs.writeFileSync(logFile, `[${new Date().toISOString()}] === Dikto started ===\n`);

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(...args);
  fs.appendFileSync(logFile, line + '\n');
}

function error(...args) {
  const line = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}`;
  console.error(...args);
  fs.appendFileSync(logFile, line + '\n');
}

module.exports = { log, error };
