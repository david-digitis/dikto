const { Tray, Menu, nativeImage, BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

let tray = null;
let currentState = 'idle';
let appRef = null;
let onMicSelected = null;
let onApiKeySet = null;
let onAutoCorrectionToggle = null;
let onSwitchThresholdChange = null;
let onMuteWhileRecordingToggle = null;
let onLanguageChange = null;
let onClipboardHistoryToggle = null;
let onClipboardMaxEntries = null;
let onClipboardClear = null;
let currentApiKey = '';
let autoCorrectionEnabled = false;
let switchThreshold = 10;
let muteWhileRecordingEnabled = false;
let nativeLanguage = 'French';
let targetLanguage = 'English';
let clipboardHistoryEnabled = false;
let clipboardMaxEntries = 100;
let updateStatus = null; // null | 'checking' | 'available' | 'up-to-date' | 'ready' | 'error'
let updateVersion = null;
let onCheckForUpdates = null;
let onQuitAndInstall = null;

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

// ─── Linux autostart via .desktop file ───────────────────────

function getAutostartPath() {
  return path.join(app.getPath('home'), '.config', 'autostart', 'dikto.desktop');
}

function isAutostartEnabled() {
  if (process.platform !== 'linux') {
    return app.getLoginItemSettings().openAtLogin;
  }
  try {
    const content = fs.readFileSync(getAutostartPath(), 'utf-8');
    return !content.includes('X-GNOME-Autostart-enabled=false') && !content.includes('Hidden=true');
  } catch {
    return false;
  }
}

function setAutostartEnabled(enabled) {
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }
  const autostartPath = getAutostartPath();
  log(`[Autostart] setAutostartEnabled(${enabled}), path: ${autostartPath}`);
  if (enabled) {
    // APPIMAGE env var is set by the AppImage runtime to the real .AppImage path
    // In dev mode, fall back to electron + app path
    const execPath = process.env.APPIMAGE
      || `${process.execPath} ${app.getAppPath()}`;
    const content = `[Desktop Entry]
Type=Application
Name=Dikto
Comment=AI dictaphone with local STT and text processing
Exec=${execPath}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`;
    fs.mkdirSync(path.dirname(autostartPath), { recursive: true });
    fs.writeFileSync(autostartPath, content, 'utf-8');
    log(`[Autostart] File written: ${autostartPath}`);
  } else {
    try {
      fs.unlinkSync(autostartPath);
      log(`[Autostart] File deleted: ${autostartPath}`);
    } catch (err) {
      log(`[Autostart] Delete failed: ${err.message}`);
    }
  }
}

function initTray(app, callbacks) {
  appRef = app;
  onMicSelected = callbacks.onMicSelected;
  onApiKeySet = callbacks.onApiKeySet;
  onAutoCorrectionToggle = callbacks.onAutoCorrectionToggle;
  onSwitchThresholdChange = callbacks.onSwitchThresholdChange;
  onMuteWhileRecordingToggle = callbacks.onMuteWhileRecordingToggle;
  onLanguageChange = callbacks.onLanguageChange;
  onClipboardHistoryToggle = callbacks.onClipboardHistoryToggle;
  onClipboardMaxEntries = callbacks.onClipboardMaxEntries;
  onClipboardClear = callbacks.onClipboardClear;
  onCheckForUpdates = callbacks.onCheckForUpdates;
  onQuitAndInstall = callbacks.onQuitAndInstall;
  currentApiKey = callbacks.currentApiKey || '';
  autoCorrectionEnabled = callbacks.autoCorrectionEnabled || false;
  switchThreshold = callbacks.switchThreshold || 10;
  muteWhileRecordingEnabled = callbacks.muteWhileRecording || false;
  nativeLanguage = callbacks.nativeLanguage || 'French';
  targetLanguage = callbacks.targetLanguage || 'English';
  clipboardHistoryEnabled = callbacks.clipboardHistoryEnabled || false;
  clipboardMaxEntries = callbacks.clipboardMaxEntries || 100;

  const icon = ICONS.idle();
  tray = new Tray(icon);
  tray.setToolTip('Dikto — Idle');
  buildMenu([]);

  // On Windows, also show menu on left click
  tray.on('click', () => {
    if (tray) tray.popUpContextMenu();
  });
}

let currentMicDevices = [];

function buildMenu(micDevices) {
  currentMicDevices = micDevices;
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
    { label: `Dikto v${appRef.getVersion()}`, enabled: false },
    { type: 'separator' },
    // ─── Transcription ───
    { label: 'Transcription', enabled: false },
    { label: 'Microphone', submenu: micSubmenu },
    {
      label: 'STT Models...',
      type: 'normal',
      click: () => {
        log('[Tray] STT Models clicked');
        const { ipcMain } = require('electron');
        ipcMain.emit('open-model-manager');
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
    {
      label: 'Mute audio while recording',
      type: 'checkbox',
      checked: muteWhileRecordingEnabled,
      click: (menuItem) => {
        muteWhileRecordingEnabled = menuItem.checked;
        log(`[Tray] Mute while recording: ${muteWhileRecordingEnabled ? 'ON' : 'OFF'}`);
        if (onMuteWhileRecordingToggle) onMuteWhileRecordingToggle(muteWhileRecordingEnabled);
      }
    },
    { type: 'separator' },
    // ─── Post-processing ───
    { label: 'Post-processing', enabled: false },
    {
      label: 'Action modes...',
      type: 'normal',
      click: () => {
        log('[Tray] Action modes clicked');
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
    // ─── Clipboard ───
    { label: 'Clipboard', enabled: false },
    {
      label: 'Clipboard history',
      type: 'checkbox',
      checked: clipboardHistoryEnabled,
      click: (menuItem) => {
        clipboardHistoryEnabled = menuItem.checked;
        log(`[Tray] Clipboard history: ${clipboardHistoryEnabled ? 'ON' : 'OFF'}`);
        if (onClipboardHistoryToggle) onClipboardHistoryToggle(clipboardHistoryEnabled);
      }
    },
    {
      label: `Max entries: ${clipboardMaxEntries}`,
      submenu: [50, 100, 200, 500].map(val => ({
        label: `${val}`,
        type: 'radio',
        checked: val === clipboardMaxEntries,
        click: () => {
          clipboardMaxEntries = val;
          log(`[Tray] Clipboard max entries: ${val}`);
          if (onClipboardMaxEntries) onClipboardMaxEntries(val);
        }
      }))
    },
    {
      label: 'Clear history',
      click: () => {
        log('[Tray] Clear clipboard history');
        if (onClipboardClear) onClipboardClear();
      }
    },
    { type: 'separator' },
    // ─── General ───
    { label: apiKeyLabel, enabled: false },
    {
      label: 'Configure Gemini API key...',
      click: () => showApiKeyDialog(),
    },
    { type: 'separator' },
    getUpdateMenuItem(),
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: isAutostartEnabled(),
      click: (menuItem) => {
        setAutostartEnabled(menuItem.checked);
        log(`[Tray] Start at login: ${menuItem.checked ? 'ON' : 'OFF'}`);
        buildMenu(currentMicDevices);
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
    title: 'Dikto — Gemini API Key',
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

function getUpdateMenuItem() {
  if (updateStatus === 'checking') {
    return { label: 'Checking for updates...', enabled: false };
  }
  if (updateStatus === 'ready') {
    return {
      label: `Install update v${updateVersion} & restart`,
      click: () => { if (onQuitAndInstall) onQuitAndInstall(); }
    };
  }
  if (updateStatus === 'up-to-date') {
    return { label: 'Up to date', enabled: false };
  }
  if (updateStatus === 'error') {
    return { label: 'Update check failed', enabled: false };
  }
  // default: idle or unknown
  return {
    label: 'Check for updates',
    click: () => { if (onCheckForUpdates) onCheckForUpdates(); }
  };
}

function setUpdateStatus(status, version) {
  updateStatus = status;
  if (version) updateVersion = version;
  buildMenu(currentMicDevices);
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
    idle: 'Dikto — Idle',
    recording: 'Dikto — Recording...',
    busy: 'Dikto — Processing...',
  };
  tray.setToolTip(tooltips[state] || tooltips.idle);
}

module.exports = { initTray, setTrayState, updateMicList, setApiKeyDisplay, setUpdateStatus };
