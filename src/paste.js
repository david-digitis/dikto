const { clipboard } = require('electron');
const { execFile, exec } = require('child_process');
const { writeFileSync, existsSync } = require('fs');
const path = require('path');
const { log } = require('./logger');

// Pre-create a tiny VBScript for instant Ctrl+V simulation on Windows
const vbsPath = path.join(__dirname, '..', 'paste.vbs');
if (process.platform === 'win32' && !existsSync(vbsPath)) {
  writeFileSync(vbsPath, 'CreateObject("WScript.Shell").SendKeys "^v"\n');
}

async function pasteText(text) {
  if (!text || text.trim().length === 0) return;

  clipboard.writeText(text);
  log(`[Paste] Clipboard set (${text.length} chars)`);

  // Tiny delay for clipboard sync
  await new Promise(r => setTimeout(r, 50));

  try {
    await simulatePaste();
    log('[Paste] Auto-paste sent');
  } catch (err) {
    log(`[Paste] Auto-paste failed: ${err.message}`);
  }
}

function simulatePaste() {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      // WScript is already running, no cold start like PowerShell
      execFile('cscript', ['//nologo', '//B', vbsPath], { timeout: 2000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      exec('xdotool key ctrl+v', { timeout: 2000 }, (err) => {
        if (err) {
          exec('ydotool key 29:1 47:1 47:0 29:0', { timeout: 2000 }, (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    }
  });
}

module.exports = { pasteText, simulatePaste };
