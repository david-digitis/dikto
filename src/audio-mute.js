// Coupe le son systeme pendant l'enregistrement, puis le retablit au relachement.
// Best-effort : tout echec est avale, la dictee n'est jamais impactee.
// Windows : helper mute.ps1 (Core Audio). Linux : pactl (PulseAudio/PipeWire).
const { execFile } = require('child_process');
const path = require('path');
const { log } = require('./logger');

const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const ps1Path = path.join(__dirname, '..', 'mute.ps1');

let mutedByUs = false;
// Serialise mute puis unmute : une dictee tres courte (unmute demande avant que
// le mute soit termine) restaure quand meme correctement.
let chain = Promise.resolve();

function runWin(action) {
  return new Promise((resolve) => {
    execFile('powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1Path, action],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) { log(`[Mute] ${action} failed: ${err.message}`); return resolve(''); }
        resolve(String(stdout || '').trim());
      });
  });
}

function runPactl(args) {
  return new Promise((resolve) => {
    execFile('pactl', args, { timeout: 3000 }, (err, stdout) => {
      if (err) { log(`[Mute] pactl failed: ${err.message}`); return resolve(''); }
      resolve(String(stdout || '').trim());
    });
  });
}

// Coupe la sortie par defaut au debut de l'enregistrement (non bloquant).
function muteForRecording() {
  chain = chain.then(async () => {
    try {
      if (isWin) {
        const out = await runWin('mute');
        mutedByUs = out.includes('did-mute');
      } else if (isLinux) {
        const state = await runPactl(['get-sink-mute', '@DEFAULT_SINK@']);
        if (state.includes('no')) {
          await runPactl(['set-sink-mute', '@DEFAULT_SINK@', '1']);
          mutedByUs = true;
        }
      }
      if (mutedByUs) log('[Mute] Output muted for recording');
    } catch (e) { log(`[Mute] mute error: ${e.message}`); }
  });
  return chain;
}

// Retablit uniquement ce que nous avons coupe, au relachement (non bloquant).
function unmuteAfterRecording() {
  chain = chain.then(async () => {
    if (!mutedByUs) return;
    try {
      if (isWin) await runWin('unmute');
      else if (isLinux) await runPactl(['set-sink-mute', '@DEFAULT_SINK@', '0']);
      log('[Mute] Output restored');
    } catch (e) { log(`[Mute] unmute error: ${e.message}`); }
    finally { mutedByUs = false; }
  });
  return chain;
}

module.exports = { muteForRecording, unmuteAfterRecording };
