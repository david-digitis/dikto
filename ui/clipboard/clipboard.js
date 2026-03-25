const searchInput = document.getElementById('search');
const historyList = document.getElementById('history-list');
const entryCount = document.getElementById('entry-count');

let entries = [];
let selectedIndex = 0;

async function loadHistory() {
  if (!window.tlw) return;
  entries = await window.tlw.getClipboardHistory();
  render();
}

function render() {
  const query = searchInput.value.toLowerCase().trim();
  const filtered = query
    ? entries.filter(e => e.type === 'text' && e.content.toLowerCase().includes(query))
    : entries;

  entryCount.textContent = `${filtered.length}`;

  if (filtered.length === 0) {
    historyList.innerHTML = '<div class="empty-state">No entries</div>';
    return;
  }

  // Clamp selected index
  if (selectedIndex >= filtered.length) selectedIndex = filtered.length - 1;
  if (selectedIndex < 0) selectedIndex = 0;

  historyList.innerHTML = filtered.map((entry, i) => {
    const selected = i === selectedIndex ? ' selected' : '';
    const time = formatTime(entry.timestamp);

    if (entry.type === 'image') {
      return `<div class="history-entry${selected}" data-index="${i}">
        <span class="entry-icon">IMG</span>
        <div class="entry-content">
          <img class="entry-image" data-filename="${entry.content}" />
          <div class="entry-meta">${entry.width}x${entry.height} &middot; ${formatSize(entry.size)}</div>
        </div>
        <span class="entry-time">${time}</span>
      </div>`;
    }

    const preview = escapeHtml(entry.content);
    const isMultiline = entry.content.includes('\n');
    return `<div class="history-entry${selected}" data-index="${i}">
      <span class="entry-icon">T</span>
      <div class="entry-content">
        <div class="entry-text${isMultiline ? ' multiline' : ''}">${preview}</div>
      </div>
      <span class="entry-time">${time}</span>
    </div>`;
  }).join('');

  // Load images async
  historyList.querySelectorAll('img[data-filename]').forEach(async img => {
    const dataUrl = await window.tlw.getClipboardImage(img.dataset.filename);
    if (dataUrl) img.src = dataUrl;
  });

  // Click handlers
  historyList.querySelectorAll('.history-entry').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index);
      const entry = filtered[idx];
      if (window.tlw) window.tlw.pasteClipboardEntry(entry.type === 'text' ? entry.content : entry.content, entry.type);
    });
  });

  // Scroll selected into view
  const selectedEl = historyList.querySelector('.selected');
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  const query = searchInput.value.toLowerCase().trim();
  const filtered = query
    ? entries.filter(e => e.type === 'text' && e.content.toLowerCase().includes(query))
    : entries;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
    render();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    render();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const entry = filtered[selectedIndex];
    if (entry && window.tlw) {
      window.tlw.pasteClipboardEntry(entry.type === 'text' ? entry.content : entry.content, entry.type);
    }
  } else if (e.key === 'Escape') {
    if (window.tlw) window.tlw.closeClipboard();
  }
});

searchInput.addEventListener('input', () => {
  selectedIndex = 0;
  render();
});

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;

  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Load on init
loadHistory();

// Refresh when window becomes visible
if (window.tlw) {
  window.tlw.onClipboardShow(() => {
    selectedIndex = 0;
    searchInput.value = '';
    loadHistory();
    searchInput.focus();
  });
}
