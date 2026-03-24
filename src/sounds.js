/**
 * Generate simple beep sounds in-memory and play them via a hidden BrowserWindow.
 * No external sound files needed.
 */

let soundWindow = null;

function ensureSoundWindow() {
  if (soundWindow && !soundWindow.isDestroyed()) return;

  const { BrowserWindow } = require('electron');

  soundWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    }
  });

  soundWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html><body><script>
const { ipcRenderer } = require('electron');

function playBeep(freq, duration, volume = 0.3) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = volume;

  // Quick fade out to avoid click
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

ipcRenderer.on('play-start', () => {
  // Short rising beep: recording started
  playBeep(600, 0.1, 0.25);
});

ipcRenderer.on('play-done', () => {
  // Two quick high beeps: done
  playBeep(800, 0.08, 0.2);
  setTimeout(() => playBeep(1000, 0.08, 0.2), 100);
});

ipcRenderer.on('play-error', () => {
  // Low buzz: error
  playBeep(250, 0.2, 0.3);
});
</script></body></html>
  `)}`);
}

function playStart() {
  ensureSoundWindow();
  soundWindow.webContents.send('play-start');
}

function playDone() {
  ensureSoundWindow();
  soundWindow.webContents.send('play-done');
}

function playError() {
  ensureSoundWindow();
  soundWindow.webContents.send('play-error');
}

module.exports = { playStart, playDone, playError };
