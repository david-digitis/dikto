const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, nativeImage } = require('electron');
const path = require('path');

// Linux: disable sandbox and work around tmpfs usrquota ESRCH bug
// on Fedora 43+ (kernel 6.x mounts /dev/shm and /tmp with usrquota,
// which breaks Chromium renderer shared memory creation via zygote)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  app.commandLine.appendSwitch('no-zygote');
}
const { log, error: logError } = require('./src/logger');
const { initTray, setTrayState, updateMicList, setUpdateStatus } = require('./src/tray');
const { initUpdater, checkForUpdates, quitAndInstall } = require('./src/updater');
const { initSTT, transcribe, getActiveModelName } = require('./src/stt');
const { startRecording, stopRecording, setAudioDevice, listAudioDevices } = require('./src/recorder');
const { pasteText, simulatePaste } = require('./src/paste');
const { loadConfig, getConfig } = require('./src/config');
const { playStart, playDone, playError } = require('./src/sounds');
const clipHistory = require('./src/clipboard-history');

// Linux: use evdev for hotkeys (uiohook doesn't work under Wayland)
const isLinux = process.platform === 'linux';
let uIOhook, UiohookKey;
if (!isLinux) {
  ({ uIOhook, UiohookKey } = require('uiohook-napi'));
}

let bubbleWindow = null;
let isRecording = false;
let recordingStartTime = null;
let selectedAction = null;
let isProcessing = false;

// Track Ctrl and Space key states for true push-to-talk
let ctrlDown = false;
let spaceDown = false;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.whenReady().then(async () => {
  await loadConfig();

  const config = getConfig();
  try {
    await initSTT(config.modelsPath);
    log(`[Dikto] STT engine initialized (threshold: ${config.switchThreshold}s)`);
  } catch (err) {
    logError('[Dikto] STT init failed:', err.message);
  }

  const { setConfigValue } = require('./src/config');
  const { setApiKeyDisplay } = require('./src/tray');

  initTray(app, {
    onMicSelected: (deviceId, label) => {
      setAudioDevice(deviceId);
      setConfigValue('audioDeviceId', deviceId);
      log(`[Dikto] Microphone changed to: ${label}`);
    },
    onApiKeySet: (key) => {
      setConfigValue('geminiApiKey', key);
      setApiKeyDisplay(key);
      log('[Dikto] Gemini API key saved');
    },
    onAutoCorrectionToggle: (enabled) => {
      setConfigValue('autoCorrection.enabled', enabled);
      log(`[Dikto] Auto-correction: ${enabled ? 'ON' : 'OFF'}`);
    },
    onSwitchThresholdChange: (seconds) => {
      setConfigValue('switchThreshold', seconds);
      log(`[Dikto] Switch threshold: ${seconds}s`);
    },
    onLanguageChange: (key, lang) => {
      setConfigValue(key, lang);
      log(`[Dikto] ${key}: ${lang}`);
    },
    onClipboardHistoryToggle: (enabled) => {
      setConfigValue('clipboardHistory.enabled', enabled);
      if (enabled) clipHistory.start(); else clipHistory.stop();
    },
    onClipboardMaxEntries: (max) => {
      setConfigValue('clipboardHistory.maxEntries', max);
      clipHistory.setMaxEntries(max);
    },
    onClipboardClear: () => {
      clipHistory.clearHistory();
    },
    onCheckForUpdates: () => checkForUpdates(),
    onQuitAndInstall: () => quitAndInstall(),
    currentApiKey: config.geminiApiKey || '',
    autoCorrectionEnabled: config.autoCorrection?.enabled || false,
    switchThreshold: config.switchThreshold || 10,
    nativeLanguage: config.nativeLanguage || 'French',
    targetLanguage: config.targetLanguage || 'English',
    clipboardHistoryEnabled: config.clipboardHistory?.enabled || false,
    clipboardMaxEntries: config.clipboardHistory?.maxEntries || 100,
  });

  // Auto-updater (only in packaged app, not in dev)
  if (app.isPackaged) {
    initUpdater({
      onStatusChange: (status, version) => setUpdateStatus(status, version),
    });
  }

  // IPC: Gemini key from dialog
  ipcMain.on('set-gemini-key', (event, key) => {
    setConfigValue('geminiApiKey', key);
    setApiKeyDisplay(key);
    log('[Dikto] Gemini API key saved');
  });

  // Enumerate audio devices
  setTimeout(async () => {
    try {
      const devices = await listAudioDevices();
      log(`[Dikto] Found ${devices.length} audio input devices`);
      devices.forEach((d, i) => log(`  [${i}] ${d.label}`));

      const config = getConfig();
      const savedDeviceId = config.audioDeviceId;
      const savedDeviceExists = savedDeviceId && devices.some(d => d.deviceId === savedDeviceId);

      if (savedDeviceId && !savedDeviceExists) {
        log(`[Dikto] WARNING: Saved mic ID no longer exists (${savedDeviceId.substring(0, 16)}...), clearing`);
        setAudioDevice(null);
        setConfigValue('audioDeviceId', '');
      }

      const devicesWithSelection = devices.map(d => ({
        ...d,
        selected: savedDeviceExists ? d.deviceId === savedDeviceId : false,
      }));

      if (savedDeviceExists) {
        setAudioDevice(savedDeviceId);
        log(`[Dikto] Using saved mic: ${devices.find(d => d.deviceId === savedDeviceId)?.label}`);
      } else {
        log('[Dikto] No saved mic or ID stale — will use system default');
      }

      updateMicList(devicesWithSelection);
    } catch (err) {
      logError('[Dikto] Device enumeration failed:', err.message);
    }
  }, 1000);

  registerPushToTalk();

  // Clipboard history
  clipHistory.init(app.getPath('userData'));
  if (config.clipboardHistory?.enabled) {
    clipHistory.start();
  }
  if (config.clipboardHistory?.maxEntries) {
    clipHistory.setMaxEntries(config.clipboardHistory.maxEntries);
  }

  // Show onboarding if first launch (no API key configured)
  if (!config.geminiApiKey && !config.onboardingDone) {
    showOnboarding();
  }

  log('[Dikto] Dikto is ready');
  log('[Dikto] Hold Ctrl+Space to record, release to transcribe');
});

// ─── Onboarding ───────────────────────────────────────────────

let onboardingWindow = null;

function showOnboarding() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  onboardingWindow = new BrowserWindow({
    width: 520,
    height: 460,
    x: Math.round(width / 2 - 260),
    y: Math.round(height / 2 - 230),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  onboardingWindow.webContents.on('did-finish-load', () => {
    log('[Onboarding] did-finish-load');
    if (onboardingWindow && !onboardingWindow.isDestroyed() && !onboardingWindow.isVisible()) {
      log('[Onboarding] Fallback show via did-finish-load');
      onboardingWindow.show();
    }
  });
  onboardingWindow.webContents.on('did-fail-load', (e, code, desc) => {
    logError(`[Onboarding] did-fail-load: ${code} ${desc}`);
  });
  onboardingWindow.webContents.on('render-process-gone', (e, details) => {
    logError(`[Onboarding] render-process-gone: ${details.reason} (exit ${details.exitCode})`);
  });
  onboardingWindow.webContents.on('console-message', (e, level, msg) => {
    log(`[Onboarding:renderer] ${msg}`);
  });

  onboardingWindow.loadFile('ui/onboarding/onboarding.html');
  onboardingWindow.once('ready-to-show', () => {
    log('[Onboarding] ready-to-show');
    onboardingWindow.show();
    // Send mic list once audio worker is ready
    setTimeout(async () => {
      const devices = await listAudioDevices();
      if (onboardingWindow && !onboardingWindow.isDestroyed()) {
        onboardingWindow.webContents.send('mic-list', devices);
      }
    }, 1500);
  });

  log('[Dikto] Onboarding window created (waiting for ready-to-show)');
}

ipcMain.on('onboarding-save-api-key', (event, key) => {
  const { setConfigValue } = require('./src/config');
  const { setApiKeyDisplay } = require('./src/tray');
  setConfigValue('geminiApiKey', key);
  setApiKeyDisplay(key);
  log('[Onboarding] API key saved');
});

ipcMain.on('onboarding-save-mic', (event, deviceId) => {
  const { setConfigValue } = require('./src/config');
  setAudioDevice(deviceId);
  setConfigValue('audioDeviceId', deviceId);
  log('[Onboarding] Mic saved');
});

ipcMain.on('onboarding-done', () => {
  const { setConfigValue } = require('./src/config');
  setConfigValue('onboardingDone', true);
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close();
    onboardingWindow = null;
  }
  log('[Onboarding] Complete');
});

// ─── Push-to-talk + Double Ctrl+C ─────────────────────────────

let lastCtrlCTime = 0;
const DOUBLE_CC_DELAY = 400; // ms between two Ctrl+C presses

function registerPushToTalk() {
  if (isLinux) {
    registerPushToTalkEvdev();
  } else {
    registerPushToTalkUiohook();
  }
}

function registerPushToTalkEvdev() {
  const { startEvdevListener } = require('./src/hotkeys-linux');
  const ok = startEvdevListener({
    onRecordStart: () => {
      if (!isRecording && !isProcessing) {
        beginRecording();
      }
    },
    onRecordStop: () => {
      finishRecording();
    },
    onDoubleCtrlC: () => {
      log('[Hotkey] Double Ctrl+C detected');
      handleDoubleCtrlC();
    },
    onClipboardToggle: () => {
      log('[Hotkey] Ctrl+B — clipboard history');
      toggleClipboardWindow();
    },
  });
  if (ok) {
    log('[Hotkey] Push-to-talk registered (evdev: hold Ctrl+Space)');
  } else {
    logError('[Hotkey] evdev listener failed — hotkeys disabled');
  }
}

function registerPushToTalkUiohook() {
  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) {
      ctrlDown = true;
    }
    if (e.keycode === UiohookKey.Space && ctrlDown && !isRecording && !isProcessing) {
      spaceDown = true;
      beginRecording();
    }
    if (e.keycode === UiohookKey.C && ctrlDown && !isRecording) {
      const now = Date.now();
      if (now - lastCtrlCTime < DOUBLE_CC_DELAY) {
        lastCtrlCTime = 0;
        log('[Hotkey] Double Ctrl+C detected');
        handleDoubleCtrlC();
      } else {
        lastCtrlCTime = now;
      }
    }
    // Ctrl+B — clipboard history
    if (e.keycode === UiohookKey.B && ctrlDown && !isRecording) {
      log('[Hotkey] Ctrl+B — clipboard history');
      toggleClipboardWindow();
    }
  });

  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) {
      ctrlDown = false;
      if (isRecording && spaceDown) {
        spaceDown = false;
        finishRecording();
      }
    }
    if (e.keycode === UiohookKey.Space) {
      spaceDown = false;
      if (isRecording) {
        finishRecording();
      }
    }
  });

  uIOhook.start();
  log('[Hotkey] Push-to-talk registered (uiohook: hold Ctrl+Space)');
}

// ─── Recording flow ───────────────────────────────────────────

function beginRecording() {
  if (isRecording) return;
  isRecording = true;
  selectedAction = null;
  recordingStartTime = Date.now();
  setTrayState('recording');

  try {
    startRecording();
    showBubble();
    playStart();
    log('[Dikto] Recording started');
  } catch (err) {
    logError('[Dikto] Recording start error:', err.message);
    playError();
    isRecording = false;
    setTrayState('idle');
  }
}

async function finishRecording() {
  if (!isRecording || isProcessing) return;
  isRecording = false;
  isProcessing = true;

  const duration = (Date.now() - recordingStartTime) / 1000;
  log(`[Dikto] Stopping recording (${duration.toFixed(1)}s)...`);
  setTrayState('busy');

  // Use action if one was clicked during recording. No waiting.
  const action = selectedAction;
  selectedAction = null;
  hideBubble();

  try {
    log('[Dikto] Stopping audio...');
    const audioBuffer = await stopRecording();

    if (!audioBuffer || audioBuffer.length === 0) {
      log('[Dikto] No audio captured');
      setTrayState('idle');
      return;
    }

    const sampleCount = audioBuffer.length;
    log(`[Dikto] Audio: ${sampleCount} samples (${(sampleCount / 16000).toFixed(1)}s)`);

    if (duration < 0.3) {
      log('[Dikto] Too short, skipping');
      setTrayState('idle');
      return;
    }

    const samples = audioBuffer instanceof Float32Array ? audioBuffer : new Float32Array(audioBuffer);

    log('[Dikto] Transcribing...');
    const t0 = Date.now();
    const text = await transcribe(samples, duration, getConfig().switchThreshold);
    log(`[Dikto] STT took ${Date.now() - t0}ms`);

    if (!text || text.trim().length === 0) {
      log('[Dikto] Empty transcription, skipping');
      setTrayState('idle');
      return;
    }

    log(`[Dikto] Result: "${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`);

    let finalText = text;

    if (action) {
      const { processBubbleAction } = require('./src/gemini');
      finalText = await processBubbleAction(text, action);
    } else if (getConfig().autoCorrection?.enabled) {
      const { processCustomPrompt } = require('./src/gemini');
      finalText = await processCustomPrompt(text, getConfig().autoCorrection.prompt);
    }

    await pasteText(finalText);
    playDone();
    setTrayState('idle');

  } catch (err) {
    logError('[Dikto] Error:', err.message);
    playError();
    setTrayState('idle');
  } finally {
    isProcessing = false;
  }
}

function waitForActionOrTimeout(ms) {
  return new Promise(resolve => {
    if (selectedAction) return resolve();
    const timer = setTimeout(resolve, ms);
    ipcMain.once('bubble-action-received', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// ─── Screen helpers ───────────────────────────────────────────

function getActiveDisplay() {
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor);
}

function getBubblePosition() {
  const display = getActiveDisplay();
  const { x, y, width, height } = display.workArea;
  return {
    width: 320,
    height: 110,
    x: x + Math.round(width / 2 - 160),
    y: y + height - 170,
  };
}

function getOverlayPosition(w = 800, h = 500) {
  const display = getActiveDisplay();
  const { x, y, width, height } = display.workArea;
  return {
    width: w,
    height: h,
    x: x + Math.round(width / 2 - w / 2),
    y: y + Math.round(height / 2 - h / 2),
  };
}

// ─── Bubble window ────────────────────────────────────────────

function showBubble() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    // Reposition to current screen
    const pos = getBubblePosition();
    bubbleWindow.setBounds(pos);
    bubbleWindow.webContents.send('recording-start');
    bubbleWindow.showInactive();
    return;
  }

  const pos = getBubblePosition();

  bubbleWindow = new BrowserWindow({
    width: pos.width,
    height: pos.height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  bubbleWindow.loadFile('ui/bubble/bubble.html');
  bubbleWindow.once('ready-to-show', () => {
    bubbleWindow.showInactive();
  });

  bubbleWindow.webContents.on('console-message', (event, level, message) => {
    log(`[Bubble] ${message}`);
  });
}

function hideBubble() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.hide();
  }
}

function notifyBubbleRecordingStopped() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.webContents.send('recording-stop');
  }
}

// ─── Double Ctrl+C -> Overlay ─────────────────────────────────

let overlayWindow = null;

function handleDoubleCtrlC() {
  const text = clipboard.readText();
  if (!text || text.trim().length === 0) {
    log('[Overlay] Clipboard empty, ignoring');
    return;
  }
  log(`[Overlay] Text: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
  showOverlay(text);
}

function showOverlay(text) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    const pos = getOverlayPosition();
    overlayWindow.setBounds(pos);
    overlayWindow.webContents.send('overlay-text', text);
    overlayWindow.show();
    overlayWindow.focus();
    return;
  }

  const pos = getOverlayPosition();

  overlayWindow = new BrowserWindow({
    width: pos.width,
    height: pos.height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: false,
    backgroundColor: '#111115',
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  overlayWindow.loadFile('ui/overlay/overlay.html');
  overlayWindow.once('ready-to-show', () => {
    overlayWindow.webContents.send('overlay-text', text);
    overlayWindow.show();
    overlayWindow.focus();
  });

  overlayWindow.webContents.on('console-message', (event, level, message) => {
    log(`[Overlay] ${message}`);
  });
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

ipcMain.on('resize-overlay', (event, width, height) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const display = getActiveDisplay();
  const { x, y, width: dw, height: dh } = display.workArea;
  const w = Math.min(width, dw - 40);
  const h = Math.min(height, dh - 40);
  overlayWindow.setBounds({
    width: w,
    height: h,
    x: x + Math.round(dw / 2 - w / 2),
    y: y + Math.round(dh / 2 - h / 2),
  });
});

// ─── Clipboard History window ─────────────────────────────────

let clipboardWindow = null;
let clipboardPasting = false;

function getClipboardPosition() {
  const display = getActiveDisplay();
  const { x, y, width, height } = display.workArea;
  const w = 500;
  const h = 520;
  return { width: w, height: h, x: x + Math.round(width / 2 - w / 2), y: y + Math.round(height / 2 - h / 2) };
}

function toggleClipboardWindow() {
  if (clipboardWindow && !clipboardWindow.isDestroyed() && clipboardWindow.isVisible()) {
    clipboardWindow.hide();
    return;
  }
  showClipboardWindow();
}

function showClipboardWindow() {
  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    const pos = getClipboardPosition();
    clipboardWindow.setBounds(pos);
    clipboardWindow.webContents.send('clipboard-show');
    clipboardWindow.show();
    clipboardWindow.focus();
    return;
  }

  const pos = getClipboardPosition();
  clipboardWindow = new BrowserWindow({
    width: pos.width,
    height: pos.height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: false,
    backgroundColor: '#111115',
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  clipboardWindow.loadFile('ui/clipboard/clipboard.html');
  clipboardWindow.once('ready-to-show', () => {
    clipboardWindow.show();
    clipboardWindow.focus();
  });

  clipboardWindow.on('blur', () => {
    if (clipboardWindow && !clipboardWindow.isDestroyed() && !clipboardPasting) {
      clipboardWindow.hide();
    }
  });

  clipboardWindow.webContents.on('console-message', (event, level, message) => {
    log(`[Clipboard] ${message}`);
  });
}

ipcMain.handle('get-clipboard-history', () => {
  return clipHistory.getHistory();
});

ipcMain.handle('get-clipboard-image', (event, filename) => {
  return clipHistory.getImageAsDataUrl(filename);
});

ipcMain.on('paste-clipboard-entry', async (event, content, type) => {
  log(`[Clipboard] Paste entry (${type})`);
  clipboardPasting = true;

  if (type === 'text') {
    clipboard.writeText(content);
  } else if (type === 'image') {
    const imgPath = path.join(app.getPath('userData'), 'clipboard-history', 'images', content);
    const img = nativeImage.createFromPath(imgPath);
    if (!img.isEmpty()) {
      clipboard.writeImage(img);
    }
  }

  // Minimize first to return focus to previous app (same as overlay)
  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    clipboardWindow.minimize();
  }
  await new Promise(r => setTimeout(r, 150));
  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    clipboardWindow.hide();
  }

  // Wait for OS to refocus the previous window
  await new Promise(r => setTimeout(r, 200));
  simulatePaste();
  clipboardPasting = false;
});

ipcMain.on('close-clipboard', () => {
  if (clipboardWindow && !clipboardWindow.isDestroyed()) {
    clipboardWindow.hide();
  }
});

ipcMain.on('clear-clipboard-history', () => {
  clipHistory.clearHistory();
  log('[Clipboard] History cleared');
});

// ─── IPC handlers ─────────────────────────────────────────────

ipcMain.on('bubble-action', (event, action) => {
  log(`[IPC] Bubble action: ${action}`);
  selectedAction = action;
  ipcMain.emit('bubble-action-received');
});

ipcMain.handle('overlay-action', async (event, text, actionId) => {
  log(`[Overlay] Processing action: ${actionId}`);
  const { processOverlayAction } = require('./src/gemini');
  const result = await processOverlayAction(text, actionId);
  log(`[Overlay] Done (${result.length} chars)`);
  return result;
});

ipcMain.on('close-overlay', () => hideOverlay());

ipcMain.on('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text);
  log('[Overlay] Copied to clipboard');
  hideOverlay();
});

ipcMain.on('insert-text', async (event, text) => {
  clipboard.writeText(text);
  log('[Overlay] Insert: hiding overlay, will paste after refocus');

  // Minimize overlay (this returns focus to previous app on Windows)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.minimize();
  }
  await new Promise(r => setTimeout(r, 100));
  hideOverlay();

  // Wait for OS to refocus the previous window
  await new Promise(r => setTimeout(r, 400));

  // Now paste
  const { simulatePaste } = require('./src/paste');
  await simulatePaste();
  log('[Overlay] Insert: paste sent');
});

ipcMain.handle('get-recording-state', () => ({
  isRecording,
  duration: isRecording ? (Date.now() - recordingStartTime) / 1000 : 0
}));

ipcMain.handle('get-actions', () => {
  const { getActions } = require('./src/gemini');
  const actions = getActions();
  return Object.entries(actions).map(([id, a]) => ({
    id, label: a.label, builtin: a.builtin || false,
  }));
});

// ─── Modes editor ─────────────────────────────────────────────

let modesEditorWindow = null;

ipcMain.on('open-modes-editor', () => {
  log('[ModesEditor] Opening...');
  if (modesEditorWindow && !modesEditorWindow.isDestroyed()) {
    modesEditorWindow.focus();
    return;
  }

  try {
    const pos = getActiveDisplay().workArea;
    log(`[ModesEditor] Display workArea: ${JSON.stringify(pos)}`);

    modesEditorWindow = new BrowserWindow({
      width: 560,
      height: 520,
      x: pos.x + Math.round(pos.width / 2 - 280),
      y: pos.y + Math.round(pos.height / 2 - 260),
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });

    modesEditorWindow.webContents.on('did-finish-load', () => {
      log('[ModesEditor] did-finish-load');
      if (modesEditorWindow && !modesEditorWindow.isDestroyed() && !modesEditorWindow.isVisible()) {
        log('[ModesEditor] Fallback show via did-finish-load');
        modesEditorWindow.show();
      }
    });
    modesEditorWindow.webContents.on('did-fail-load', (e, code, desc) => {
      logError(`[ModesEditor] did-fail-load: ${code} ${desc}`);
    });
    modesEditorWindow.webContents.on('render-process-gone', (e, details) => {
      logError(`[ModesEditor] render-process-gone: ${details.reason} (exit ${details.exitCode})`);
    });
    modesEditorWindow.webContents.on('console-message', (e, level, msg) => {
      log(`[ModesEditor:renderer] ${msg}`);
    });

    modesEditorWindow.loadFile('ui/modes-editor/modes-editor.html');
    modesEditorWindow.once('ready-to-show', () => {
      log('[ModesEditor] ready-to-show');
      modesEditorWindow.show();
    });
  } catch (err) {
    logError(`[ModesEditor] Error: ${err.message}`);
  }
});

ipcMain.on('close-modes-editor', () => {
  if (modesEditorWindow && !modesEditorWindow.isDestroyed()) {
    modesEditorWindow.close();
    modesEditorWindow = null;
  }
});

ipcMain.handle('get-custom-actions', () => {
  return getConfig().customActions || [];
});

ipcMain.handle('save-custom-actions', (event, actions) => {
  const { setConfigValue } = require('./src/config');
  setConfigValue('customActions', actions);
  log(`[Modes] Saved ${actions.length} custom actions`);
  return true;
});

// ─── Model manager ────────────────────────────────────────────

let modelManagerWindow = null;

ipcMain.on('open-model-manager', () => {
  log('[ModelManager] Opening...');
  if (modelManagerWindow && !modelManagerWindow.isDestroyed()) {
    modelManagerWindow.focus();
    return;
  }

  try {
    const pos = getActiveDisplay().workArea;
    log(`[ModelManager] Display workArea: ${JSON.stringify(pos)}`);

    modelManagerWindow = new BrowserWindow({
      width: 520,
      height: 480,
      x: pos.x + Math.round(pos.width / 2 - 260),
      y: pos.y + Math.round(pos.height / 2 - 240),
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });

    modelManagerWindow.webContents.on('did-finish-load', () => {
      log('[ModelManager] did-finish-load');
      if (modelManagerWindow && !modelManagerWindow.isDestroyed() && !modelManagerWindow.isVisible()) {
        log('[ModelManager] Fallback show via did-finish-load');
        modelManagerWindow.show();
      }
    });
    modelManagerWindow.webContents.on('did-fail-load', (e, code, desc) => {
      logError(`[ModelManager] did-fail-load: ${code} ${desc}`);
    });
    modelManagerWindow.webContents.on('render-process-gone', (e, details) => {
      logError(`[ModelManager] render-process-gone: ${details.reason} (exit ${details.exitCode})`);
    });
    modelManagerWindow.webContents.on('console-message', (e, level, msg) => {
      log(`[ModelManager:renderer] ${msg}`);
    });

    modelManagerWindow.loadFile('ui/models/models.html');
    modelManagerWindow.once('ready-to-show', () => {
      log('[ModelManager] ready-to-show');
      modelManagerWindow.show();
    });
  } catch (err) {
    logError(`[ModelManager] Error: ${err.message}`);
  }
});

ipcMain.on('close-models', () => {
  if (modelManagerWindow && !modelManagerWindow.isDestroyed()) {
    modelManagerWindow.close();
    modelManagerWindow = null;
  }
});

ipcMain.handle('list-models', () => {
  const { listModels } = require('./src/models');
  const { getActiveModelName } = require('./src/stt');
  const models = listModels();
  const activeName = getActiveModelName();
  return models.map(m => ({ ...m, active: m.name === activeName }));
});

ipcMain.on('download-model', async (event, modelId) => {
  const { downloadModel } = require('./src/models');
  try {
    await downloadModel(modelId, (downloaded, total, speed) => {
      const percent = total > 0 ? (downloaded / total) * 100 : 0;
      const speedStr = (speed / (1024 * 1024)).toFixed(1) + ' MB/s';
      if (modelManagerWindow && !modelManagerWindow.isDestroyed()) {
        modelManagerWindow.webContents.send('download-progress', modelId, percent, speedStr);
      }
    });
    log(`[Models] Download complete: ${modelId}`);
    // Load newly downloaded model into dual engine
    const { loadModel } = require('./src/stt');
    loadModel(modelId);
    log(`[Models] Model loaded into dual engine: ${modelId}`);
    if (modelManagerWindow && !modelManagerWindow.isDestroyed()) {
      modelManagerWindow.webContents.send('download-complete', modelId);
    }
  } catch (err) {
    logError(`[Models] Download error: ${err.message}`);
  }
});

ipcMain.handle('delete-model', async (event, modelId) => {
  const { deleteModel } = require('./src/models');
  const { unloadModel } = require('./src/stt');
  deleteModel(modelId);      // remove files from disk
  unloadModel(modelId);      // free RAM + refresh active engine
  log(`[Models] Deleted: ${modelId}`);
});

// ─── App lifecycle ────────────────────────────────────────────

app.on('will-quit', () => {
  if (!isLinux && uIOhook) uIOhook.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
