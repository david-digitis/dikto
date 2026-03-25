const { clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let history = [];
let enabled = false;
let maxEntries = 100;
let lastText = '';
let lastImageHash = '';
let pollInterval = null;
let dataDir = '';
let imagesDir = '';
let historyFile = '';

function init(userDataPath) {
  dataDir = path.join(userDataPath, 'clipboard-history');
  imagesDir = path.join(dataDir, 'images');
  historyFile = path.join(dataDir, 'history.json');

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  // Load existing history
  try {
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
    }
  } catch (err) {
    console.error('[Clipboard] Failed to load history:', err.message);
    history = [];
  }

  // Seed last values to avoid capturing current clipboard on start
  lastText = clipboard.readText() || '';
  const img = clipboard.readImage();
  lastImageHash = img.isEmpty() ? '' : simpleHash(img.toPNG());
}

function start() {
  if (pollInterval) return;
  enabled = true;
  // Reseed to avoid capturing whatever is in clipboard right now
  lastText = clipboard.readText() || '';
  const img = clipboard.readImage();
  lastImageHash = img.isEmpty() ? '' : simpleHash(img.toPNG());

  pollInterval = setInterval(poll, 800);
  console.log('[Clipboard] History monitoring started');
}

function stop() {
  enabled = false;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  console.log('[Clipboard] History monitoring stopped');
}

function poll() {
  // Check text first
  const text = clipboard.readText() || '';
  if (text && text !== lastText) {
    lastText = text;
    lastImageHash = ''; // Reset image tracking when text changes
    addEntry({ type: 'text', content: text });
    return;
  }

  // Check image
  const img = clipboard.readImage();
  if (!img.isEmpty()) {
    const png = img.toPNG();
    const hash = simpleHash(png);
    if (hash !== lastImageHash) {
      lastImageHash = hash;
      lastText = ''; // Reset text tracking when image changes
      const filename = `img_${Date.now()}.png`;
      const filepath = path.join(imagesDir, filename);
      fs.writeFileSync(filepath, png);
      addEntry({
        type: 'image',
        content: filename,
        width: img.getSize().width,
        height: img.getSize().height,
        size: png.length,
      });
    }
  }
}

function addEntry(entry) {
  entry.timestamp = Date.now();

  // Deduplicate: if same content already exists, move it to top
  if (entry.type === 'text') {
    history = history.filter(h => !(h.type === 'text' && h.content === entry.content));
  }

  history.unshift(entry);

  // Trim to max
  while (history.length > maxEntries) {
    const removed = history.pop();
    if (removed.type === 'image') {
      const imgPath = path.join(imagesDir, removed.content);
      try { fs.unlinkSync(imgPath); } catch (e) { /* ignore */ }
    }
  }

  save();
}

function save() {
  try {
    fs.writeFileSync(historyFile, JSON.stringify(history), 'utf-8');
  } catch (err) {
    console.error('[Clipboard] Failed to save history:', err.message);
  }
}

function getHistory() {
  return history.map(entry => {
    if (entry.type === 'image') {
      return { ...entry, imagePath: path.join(imagesDir, entry.content) };
    }
    return entry;
  });
}

function getImageAsDataUrl(filename) {
  const filepath = path.join(imagesDir, filename);
  if (!fs.existsSync(filepath)) return null;
  const buf = fs.readFileSync(filepath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function clearHistory() {
  // Delete all image files
  for (const entry of history) {
    if (entry.type === 'image') {
      const imgPath = path.join(imagesDir, entry.content);
      try { fs.unlinkSync(imgPath); } catch (e) { /* ignore */ }
    }
  }
  history = [];
  save();
  console.log('[Clipboard] History cleared');
}

function setMaxEntries(max) {
  maxEntries = max;
  // Trim if needed
  while (history.length > maxEntries) {
    const removed = history.pop();
    if (removed.type === 'image') {
      const imgPath = path.join(imagesDir, removed.content);
      try { fs.unlinkSync(imgPath); } catch (e) { /* ignore */ }
    }
  }
  save();
}

function isEnabled() {
  return enabled;
}

function simpleHash(buffer) {
  // Fast hash for comparing images — not cryptographic
  let hash = 0;
  const step = Math.max(1, Math.floor(buffer.length / 1024));
  for (let i = 0; i < buffer.length; i += step) {
    hash = ((hash << 5) - hash + buffer[i]) | 0;
  }
  return hash.toString(36);
}

module.exports = {
  init,
  start,
  stop,
  isEnabled,
  getHistory,
  getImageAsDataUrl,
  clearHistory,
  setMaxEntries,
  addEntry,
};
