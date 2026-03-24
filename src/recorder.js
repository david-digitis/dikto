/**
 * Audio recorder using a hidden Electron BrowserWindow + MediaDevices API.
 */
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { log, error: logError } = require('./logger');

let audioWindow = null;
let selectedDeviceId = null;

function ensureAudioWindow() {
  if (audioWindow && !audioWindow.isDestroyed()) return;

  audioWindow = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload-audio.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  audioWindow.loadFile(path.join(__dirname, '..', 'ui', 'audio-worker.html'));

  // Capture renderer console messages into debug.log
  audioWindow.webContents.on('console-message', (event, level, message) => {
    log(`[AudioWorker] ${message}`);
  });
}

function setAudioDevice(deviceId) {
  selectedDeviceId = deviceId;
  log(`[Recorder] Audio device set to: ${deviceId}`);
}

function getAudioDeviceId() {
  return selectedDeviceId;
}

function startRecording() {
  ensureAudioWindow();
  const options = selectedDeviceId ? { deviceId: selectedDeviceId } : {};

  if (audioWindow.webContents.isLoading()) {
    audioWindow.webContents.once('did-finish-load', () => {
      audioWindow.webContents.send('start-recording', options);
    });
  } else {
    audioWindow.webContents.send('start-recording', options);
  }
}

function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!audioWindow || audioWindow.isDestroyed()) {
      return reject(new Error('Audio window not available'));
    }

    const timeout = setTimeout(() => {
      reject(new Error('Recording stop timed out'));
    }, 10000);

    ipcMain.once('audio-data', (event, data) => {
      clearTimeout(timeout);
      resolve(data);
    });

    ipcMain.once('audio-error', (event, errorMsg) => {
      clearTimeout(timeout);
      reject(new Error(errorMsg));
    });

    audioWindow.webContents.send('stop-recording');
  });
}

/**
 * Get list of audio input devices (must be called after audioWindow is ready)
 */
function listAudioDevices() {
  return new Promise((resolve) => {
    ensureAudioWindow();

    const handler = (event, devices) => {
      resolve(devices);
    };
    ipcMain.once('audio-devices', handler);

    const send = () => audioWindow.webContents.send('list-devices');
    if (audioWindow.webContents.isLoading()) {
      audioWindow.webContents.once('did-finish-load', send);
    } else {
      send();
    }

    // Timeout
    setTimeout(() => {
      ipcMain.removeListener('audio-devices', handler);
      resolve([]);
    }, 5000);
  });
}

module.exports = { startRecording, stopRecording, setAudioDevice, getAudioDeviceId, listAudioDevices };
