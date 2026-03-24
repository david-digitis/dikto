const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tlw', {
  // Bubble actions
  sendAction: (action) => ipcRenderer.send('bubble-action', action),

  // Overlay actions
  sendOverlayAction: (text, action) => ipcRenderer.invoke('overlay-action', text, action),
  closeOverlay: () => ipcRenderer.send('close-overlay'),
  copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),
  insertText: (text) => ipcRenderer.send('insert-text', text),

  // Onboarding
  onboardingSaveApiKey: (key) => ipcRenderer.send('onboarding-save-api-key', key),
  onboardingSaveMic: (deviceId) => ipcRenderer.send('onboarding-save-mic', deviceId),
  onboardingDone: () => ipcRenderer.send('onboarding-done'),
  onMicList: (callback) => ipcRenderer.on('mic-list', callback),

  // Actions
  getActions: () => ipcRenderer.invoke('get-actions'),
  getCustomActions: () => ipcRenderer.invoke('get-custom-actions'),
  saveCustomActions: (actions) => ipcRenderer.invoke('save-custom-actions', actions),
  closeModesEditor: () => ipcRenderer.send('close-modes-editor'),

  // Model manager
  listModels: () => ipcRenderer.invoke('list-models'),
  downloadModel: (modelId) => ipcRenderer.send('download-model', modelId),
  deleteModel: (modelId) => ipcRenderer.invoke('delete-model', modelId),
  closeModels: () => ipcRenderer.send('close-models'),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', callback),

  // Events from main
  onRecordingStart: (callback) => ipcRenderer.on('recording-start', callback),
  onRecordingStop: (callback) => ipcRenderer.on('recording-stop', callback),
  onOverlayText: (callback) => ipcRenderer.on('overlay-text', callback),
});
