
const electron = require('electron');
console.log('electron keys:', Object.keys(electron));
console.log('app:', typeof electron.app);
console.log('BrowserWindow:', typeof electron.BrowserWindow);
if (electron.app) {
  electron.app.whenReady().then(() => {
    console.log('App ready!');
    electron.app.quit();
  });
} else {
  console.log('app is undefined - checking default export');
  console.log('module type:', typeof electron);
  process.exit(1);
}
