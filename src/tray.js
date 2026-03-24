const { Tray, Menu, nativeImage, BrowserWindow } = require('electron');
const { log } = require('./logger');

let tray = null;
let currentState = 'idle';
let appRef = null;
let onMicSelected = null;
let onApiKeySet = null;
let onAutoCorrectionToggle = null;
let onSwitchThresholdChange = null;
let onLanguageChange = null;
let currentApiKey = '';
let autoCorrectionEnabled = false;
let switchThreshold = 10;
let nativeLanguage = 'French';
let targetLanguage = 'English';

const LANGUAGES = ['French', 'English', 'German', 'Spanish', 'Italian', 'Portuguese', 'Dutch'];

function createMicIcon(color) {
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4, 0);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;

  function setPixel(x, y) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    canvas[idx] = r; canvas[idx + 1] = g; canvas[idx + 2] = b; canvas[idx + 3] = 255;
  }
  function fillCircle(cx, cy, radius) {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dy * dy <= radius * radius) setPixel(cx + dx, cy + dy);
  }
  function drawLine(x, y1, y2) { for (let y = y1; y <= y2; y++) setPixel(x, y); }

  fillCircle(8, 4, 3);
  drawLine(7, 4, 9); drawLine(8, 4, 9); drawLine(9, 4, 9);
  setPixel(4, 5); setPixel(4, 6); setPixel(4, 7); setPixel(4, 8);
  setPixel(5, 9); setPixel(6, 10);
  setPixel(12, 5); setPixel(12, 6); setPixel(12, 7); setPixel(12, 8);
  setPixel(11, 9); setPixel(10, 10);
  drawLine(8, 10, 13);
  for (let x = 5; x <= 11; x++) setPixel(x, 14);

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

const ICONS = {
  idle: () => createMicIcon(0x888888),
  recording: () => createMicIcon(0xee3333),
  busy: () => createMicIcon(0xddaa00),
};

function initTray(app, callbacks) {
  appRef = app;
  onMicSelected = callbacks.onMicSelected;
  onApiKeySet = callbacks.onApiKeySet;
  onAutoCorrectionToggle = callbacks.onAutoCorrectionToggle;
  onSwitchThresholdChange = callbacks.onSwitchThresholdChange;
  onLanguageChange = callbacks.onLanguageChange;
  currentApiKey = callbacks.currentApiKey || '';
  autoCorrectionEnabled = callbacks.autoCorrectionEnabled || false;
  switchThreshold = callbacks.switchThreshold || 10;
  nativeLanguage = callbacks.nativeLanguage || 'French';
  targetLanguage = callbacks.targetLanguage || 'English';

  const icon = ICONS.idle();
  tray = new Tray(icon);
  tray.setToolTip('The Last Whisper — Idle');
  buildMenu([]);

  // On Windows, also show menu on left click
  tray.on('click', () => {
    if (tray) tray.popUpContextMenu();
  });
}

function buildMenu(micDevices) {
  const micSubmenu = micDevices.length > 0
    ? micDevices.map(d => ({
        label: d.label,
        type: 'radio',
        checked: d.selected || false,
        click: () => {
          log(`[Tray] Mic selected: ${d.label}`);
          if (onMicSelected) onMicSelected(d.deviceId, d.label);
        }
      }))
    : [{ label: '(loading...)', enabled: false }];

  const apiKeyLabel = currentApiKey
    ? `Gemini key: ...${currentApiKey.slice(-6)}`
    : 'Gemini key: (not configured)';

  const contextMenu = Menu.buildFromTemplate([
    { label: 'The Last Whisper v0.2.0', enabled: false },
    { type: 'separator' },
    { label: 'Microphone', submenu: micSubmenu },
    {
      label: 'STT Models...',
      click: () => {
        const { ipcMain } = require('electron');
        ipcMain.emit('open-model-manager');
      }
    },
    {
      label: 'Action modes...',
      click: () => {
        const { ipcMain } = require('electron');
        ipcMain.emit('open-modes-editor');
      }
    },
    {
      label: 'Gemini auto-correction',
      type: 'checkbox',
      checked: autoCorrectionEnabled,
      click: (menuItem) => {
        autoCorrectionEnabled = menuItem.checked;
        log(`[Tray] Auto-correction: ${autoCorrectionEnabled ? 'ON' : 'OFF'}`);
        if (onAutoCorrectionToggle) onAutoCorrectionToggle(autoCorrectionEnabled);
      }
    },
    {
      label: `Whisper switch: ${switchThreshold}s`,
      submenu: [5, 8, 10, 15, 20, 30].map(val => ({
        label: `${val}s`,
        type: 'radio',
        checked: val === switchThreshold,
        click: () => {
          switchThreshold = val;
          log(`[Tray] Switch threshold: ${val}s`);
          if (onSwitchThresholdChange) onSwitchThresholdChange(val);
        }
      }))
    },
    { type: 'separator' },
    {
      label: `Native language: ${nativeLanguage}`,
      submenu: LANGUAGES.map(lang => ({
        label: lang,
        type: 'radio',
        checked: lang === nativeLanguage,
        click: () => {
          nativeLanguage = lang;
          log(`[Tray] Native language: ${lang}`);
          if (onLanguageChange) onLanguageChange('nativeLanguage', lang);
        }
      }))
    },
    {
      label: `Target language: ${targetLanguage}`,
      submenu: LANGUAGES.map(lang => ({
        label: lang,
        type: 'radio',
        checked: lang === targetLanguage,
        click: () => {
          targetLanguage = lang;
          log(`[Tray] Target language: ${lang}`);
          if (onLanguageChange) onLanguageChange('targetLanguage', lang);
        }
      }))
    },
    { type: 'separator' },
    { label: apiKeyLabel, enabled: false },
    {
      label: 'Configure Gemini API key...',
      click: () => showApiKeyDialog(),
    },
    { type: 'separator' },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: appRef.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        appRef.setLoginItemSettings({ openAtLogin: menuItem.checked });
        log(`[Tray] Start at login: ${menuItem.checked ? 'ON' : 'OFF'}`);
      }
    },
    {
      label: 'Quit',
      click: () => appRef.quit(),
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function showApiKeyDialog() {
  const win = new BrowserWindow({
    width: 480,
    height: 180,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    title: 'The Last Whisper — Gemini API Key',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    }
  });

  const currentVal = currentApiKey || '';

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #1e293b; color: #e2e8f0; padding: 20px; margin: 0; }
  h3 { margin: 0 0 12px 0; font-size: 14px; color: #f97316; }
  input { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 13px; box-sizing: border-box; }
  input:focus { outline: none; border-color: #f97316; }
  .row { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
  button { padding: 7px 18px; border-radius: 6px; border: none; font-size: 13px; cursor: pointer; }
  .save { background: #f97316; color: #0f172a; font-weight: 600; }
  .save:hover { background: #fb923c; }
  .cancel { background: #334155; color: #e2e8f0; }
  .cancel:hover { background: #475569; }
</style>
</head>
<body>
  <h3>Gemini API Key</h3>
  <input id="key" type="text" placeholder="AIzaSy..." value="${currentVal}" autofocus />
  <div class="row">
    <button class="cancel" onclick="window.close()">Cancel</button>
    <button class="save" onclick="save()">Save</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    function save() {
      const key = document.getElementById('key').value.trim();
      if (key) {
        ipcRenderer.send('set-gemini-key', key);
        window.close();
      }
    }
    document.getElementById('key').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') window.close();
    });
  </script>
</body>
</html>
  `)}`);

  win.setMenu(null);
}

function setApiKeyDisplay(key) {
  currentApiKey = key;
}

function updateMicList(devices) {
  buildMenu(devices);
}

function setTrayState(state) {
  if (!tray || currentState === state) return;
  currentState = state;
  const iconFn = ICONS[state];
  if (iconFn) tray.setImage(iconFn());

  const tooltips = {
    idle: 'The Last Whisper — Idle',
    recording: 'The Last Whisper — Recording...',
    busy: 'The Last Whisper — Processing...',
  };
  tray.setToolTip(tooltips[state] || tooltips.idle);
}

module.exports = { initTray, setTrayState, updateMicList, setApiKeyDisplay };
