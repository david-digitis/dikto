const sourceTextEl = document.getElementById('source-text');
const actionsRow = document.getElementById('actions');
const resultAreaEl = document.getElementById('result-area');
const resultTextEl = document.getElementById('result-text');
const loadingEl = document.getElementById('loading');

let sourceText = '';
let resultText = '';

// ─── Load action buttons dynamically ─────────────────────────

async function loadActions() {
  if (!window.tlw) return;
  const actions = await window.tlw.getActions();
  actionsRow.innerHTML = '';

  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'action-btn' + (a.builtin ? ' builtin' : '');
    btn.dataset.action = a.id;
    btn.textContent = a.label;
    btn.addEventListener('click', () => onActionClick(btn, a.id));
    actionsRow.appendChild(btn);
  });
}

async function onActionClick(btn, actionId) {
  actionsRow.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  resultAreaEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  loadingEl.textContent = 'Gemini...';

  try {
    const result = await window.tlw.sendOverlayAction(sourceText, actionId);
    resultText = result;
    resultTextEl.textContent = result;
    loadingEl.classList.add('hidden');
    resultAreaEl.classList.remove('hidden');
  } catch (err) {
    loadingEl.textContent = 'Error: ' + err.message;
  }
}

loadActions();

// ─── Receive text from main process ──────────────────────────

if (window.tlw) {
  window.tlw.onOverlayText((event, text) => {
    sourceText = text;
    sourceTextEl.textContent = text.length > 300 ? text.substring(0, 300) + '...' : text;
    resultAreaEl.classList.add('hidden');
    loadingEl.classList.add('hidden');
    actionsRow.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
    // Reload actions (may have changed)
    loadActions();
  });
}

// ─── Close ───────────────────────────────────────────────────

document.getElementById('close-btn').addEventListener('click', () => {
  if (window.tlw) window.tlw.closeOverlay();
});

document.getElementById('backdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    if (window.tlw) window.tlw.closeOverlay();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && window.tlw) window.tlw.closeOverlay();
});

// ─── Result buttons ──────────────────────────────────────────

document.getElementById('copy-btn').addEventListener('click', () => {
  if (window.tlw && resultText) {
    window.tlw.copyToClipboard(resultText);
  }
});

document.getElementById('insert-btn').addEventListener('click', () => {
  if (window.tlw && resultText) {
    window.tlw.insertText(resultText);
  }
});
