const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard } = require('electron');
const path = require('path');
const { log, error: logError } = require('./src/logger');
const { initTray, setTrayState, updateMicList } = require('./src/tray');
const { initSTT, transcribe, getActiveModelName } = require('./src/stt');
const { startRecording, stopRecording, setAudioDevice, listAudioDevices } = require('./src/recorder');
const { pasteText } = require('./src/paste');
const { loadConfig, getConfig } = require('./src/config');
const { playStart, playDone, playError } = require('./src/sounds');
const { uIOhook, UiohookKey } = require('uiohook-napi');

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
    log(`[TLW] STT engine initialized (threshold: ${config.switchThreshold}s)`);
  } catch (err) {
    logError('[TLW] STT init failed:', err.message);
  }

  const { setConfigValue } = require('./src/config');
  const { setApiKeyDisplay } = require('./src/tray');

  initTray(app, {
    onMicSelected: (deviceId, label) => {
      setAudioDevice(deviceId);
      setConfigValue('audioDeviceId', deviceId);
      log(`[TLW] Microphone changed to: ${label}`);
    },
    onApiKeySet: (key) => {
      setConfigValue('geminiApiKey', key);
      setApiKeyDisplay(key);
      log('[TLW] Gemini API key saved');
    },
    onAutoCorrectionToggle: (enabled) => {
      setConfigValue('autoCorrection.enabled', enabled);
      log(`[TLW] Auto-correction: ${enabled ? 'ON' : 'OFF'}`);
    },
    onSwitchThresholdChange: (seconds) => {
      setConfigValue('switchThreshold', seconds);
      log(`[TLW] Switch threshold: ${seconds}s`);
    },
    onLanguageChange: (key, lang) => {
      setConfigValue(key, lang);
      log(`[TLW] ${key}: ${lang}`);
    },
    currentApiKey: config.geminiApiKey || '',
    autoCorrectionEnabled: config.autoCorrection?.enabled || false,
    switchThreshold: config.switchThreshold || 10,
    nativeLanguage: config.nativeLanguage || 'French',
    targetLanguage: config.targetLanguage || 'English',
  });

  // IPC: Gemini key from dialog
  ipcMain.on('set-gemini-key', (event, key) => {
    setConfigValue('geminiApiKey', key);
    setApiKeyDisplay(key);
    log('[TLW] Gemini API key saved');
  });

  // Enumerate audio devices
  setTimeout(async () => {
    try {
      const devices = await listAudioDevices();
      log(`[TLW] Found ${devices.length} audio input devices`);
      devices.forEach((d, i) => log(`  [${i}] ${d.label}`));

      const config = getConfig();
      const savedDeviceId = config.audioDeviceId;
      const devicesWithSelection = devices.map(d => ({
        ...d,
        selected: savedDeviceId ? d.deviceId === savedDeviceId : false,
      }));

      if (savedDeviceId) {
        setAudioDevice(savedDeviceId);
        log(`[TLW] Using saved mic: ${devices.find(d => d.deviceId === savedDeviceId)?.label || '?'}`);
      }

      updateMicList(devicesWithSelection);
    } catch (err) {
      logError('[TLW] Device enumeration failed:', err.message);
    }
  }, 1000);

  registerPushToTalk();

  // Show onboarding if first launch (no API key configured)
  if (!config.geminiApiKey && !config.onboardingDone) {
    showOnboarding();
  }

  log('[TLW] The Last Whisper is ready');
  log('[TLW] Hold Ctrl+Space to record, release to transcribe');
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

  onboardingWindow.loadFile('ui/onboarding/onboarding.html');
  onboardingWindow.once('ready-to-show', () => {
    onboardingWindow.show();
    // Send mic list once audio worker is ready
    setTimeout(async () => {
      const devices = await listAudioDevices();
      if (onboardingWindow && !onboardingWindow.isDestroyed()) {
        onboardingWindow.webContents.send('mic-list', devices);
      }
    }, 1500);
  });

  log('[TLW] Onboarding shown');
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

// ─── Push-to-talk + Double Ctrl+C via uiohook ────────────────

let lastCtrlCTime = 0;
const DOUBLE_CC_DELAY = 400; // ms between two Ctrl+C presses

function registerPushToTalk() {
  uIOhook.on('keydown', (e) => {
    // Track Ctrl state
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) {
      ctrlDown = true;
    }

    // Ctrl+Space = push-to-talk start
    if (e.keycode === UiohookKey.Space && ctrlDown && !isRecording && !isProcessing) {
      spaceDown = true;
      beginRecording();
    }

    // Detect double Ctrl+C
    if (e.keycode === UiohookKey.C && ctrlDown && !isRecording) {
      const now = Date.now();
      if (now - lastCtrlCTime < DOUBLE_CC_DELAY) {
        // Double Ctrl+C detected!
        lastCtrlCTime = 0;
        log('[Hotkey] Double Ctrl+C detected');
        handleDoubleCtrlC();
      } else {
        lastCtrlCTime = now;
      }
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
    log('[TLW] Recording started');
  } catch (err) {
    logError('[TLW] Recording start error:', err.message);
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
  log(`[TLW] Stopping recording (${duration.toFixed(1)}s)...`);
  setTrayState('busy');

  // Use action if one was clicked during recording. No waiting.
  const action = selectedAction;
  selectedAction = null;
  hideBubble();

  try {
    log('[TLW] Stopping audio...');
    const audioBuffer = await stopRecording();

    if (!audioBuffer || audioBuffer.length === 0) {
      log('[TLW] No audio captured');
      setTrayState('idle');
      return;
    }

    const sampleCount = audioBuffer.length;
    log(`[TLW] Audio: ${sampleCount} samples (${(sampleCount / 16000).toFixed(1)}s)`);

    if (duration < 0.3) {
      log('[TLW] Too short, skipping');
      setTrayState('idle');
      return;
    }

    const samples = audioBuffer instanceof Float32Array ? audioBuffer : new Float32Array(audioBuffer);

    log('[TLW] Transcribing...');
    const t0 = Date.now();
    const text = await transcribe(samples, duration, getConfig().switchThreshold);
    log(`[TLW] STT took ${Date.now() - t0}ms`);

    if (!text || text.trim().length === 0) {
      log('[TLW] Empty transcription, skipping');
      setTrayState('idle');
      return;
    }

    log(`[TLW] Result: "${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`);

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
    logError('[TLW] Error:', err.message);
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

function getOverlayPosition() {
  const display = getActiveDisplay();
  const { x, y, width, height } = display.workArea;
  return {
    width: 500,
    height: 420,
    x: x + Math.round(width / 2 - 250),
    y: y + Math.round(height / 2 - 210),
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
    transparent: true,
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
  if (modesEditorWindow && !modesEditorWindow.isDestroyed()) {
    modesEditorWindow.focus();
    return;
  }

  const pos = getActiveDisplay().workArea;

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

  modesEditorWindow.loadFile('ui/modes-editor/modes-editor.html');
  modesEditorWindow.once('ready-to-show', () => modesEditorWindow.show());
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
  if (modelManagerWindow && !modelManagerWindow.isDestroyed()) {
    modelManagerWindow.focus();
    return;
  }

  const pos = getActiveDisplay().workArea;

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

  modelManagerWindow.loadFile('ui/models/models.html');
  modelManagerWindow.once('ready-to-show', () => modelManagerWindow.show());
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
  deleteModel(modelId);
  log(`[Models] Deleted: ${modelId}`);
});

// ─── App lifecycle ────────────────────────────────────────────

app.on('will-quit', () => {
  uIOhook.stop();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
