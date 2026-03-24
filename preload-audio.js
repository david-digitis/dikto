const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioWorker', {
  onStartRecording: (callback) => ipcRenderer.on('start-recording', callback),
  onStopRecording: (callback) => ipcRenderer.on('stop-recording', callback),
  onListDevices: (callback) => ipcRenderer.on('list-devices', callback),
  sendAudioData: (data) => ipcRenderer.send('audio-data', data),
  sendError: (msg) => ipcRenderer.send('audio-error', msg),
  sendDevices: (devices) => ipcRenderer.send('audio-devices', devices),
});
