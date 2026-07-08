const { autoUpdater } = require('electron-updater');
const { Notification } = require('electron');
const { log, error: logError } = require('./logger');

let onStatusChange = null;

function initUpdater(callbacks = {}) {
  onStatusChange = callbacks.onStatusChange || null;

  autoUpdater.logger = null; // we handle logging ourselves
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log('[Updater] Checking for updates...');
    if (onStatusChange) onStatusChange('checking');
  });

  autoUpdater.on('update-available', (info) => {
    log(`[Updater] Update available: v${info.version}`);
    if (onStatusChange) onStatusChange('available', info.version);
    // Start downloading automatically
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', () => {
    log('[Updater] Already up to date');
    if (onStatusChange) onStatusChange('up-to-date');
  });

  autoUpdater.on('download-progress', (progress) => {
    log(`[Updater] Downloading: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log(`[Updater] Update v${info.version} ready to install`);
    if (onStatusChange) onStatusChange('ready', info.version);
    // Notification systeme pour prevenir sans avoir a ouvrir le menu tray
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'Dikto — mise a jour prete',
        body: `La version ${info.version} est telechargee. Cliquez pour redemarrer et l'installer.`,
      });
      notif.on('click', () => quitAndInstall());
      notif.show();
    }
  });

  autoUpdater.on('error', (err) => {
    logError(`[Updater] Error: ${err.message}`);
    if (onStatusChange) onStatusChange('error', err.message);
  });
}

function checkForUpdates() {
  autoUpdater.checkForUpdates();
}

function quitAndInstall() {
  autoUpdater.quitAndInstall();
}

module.exports = { initUpdater, checkForUpdates, quitAndInstall };
