const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'debug.log');

// Clear log on start
fs.writeFileSync(logFile, `[${new Date().toISOString()}] === The Last Whisper started ===\n`);

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
