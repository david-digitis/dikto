const sourceTextEl = document.getElementById('source-text');
const resultAreaEl = document.getElementById('result-area');
const resultTextEl = document.getElementById('result-text');
const loadingEl = document.getElementById('loading');

let sourceText = '';
let resultText = '';

// Receive the selected text from main process
if (window.tlw) {
  window.tlw.onOverlayText((event, text) => {
    sourceText = text;
    sourceTextEl.textContent = text.length > 300 ? text.substring(0, 300) + '...' : text;
    // Reset state for new text
    resultAreaEl.classList.add('hidden');
    loadingEl.classList.add('hidden');
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
  });
}

// Close
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

// Action buttons
document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const action = btn.dataset.action;

    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    resultAreaEl.classList.add('hidden');
    loadingEl.classList.remove('hidden');

    try {
      const result = await window.tlw.sendOverlayAction(sourceText, action);
      resultText = result;
      resultTextEl.textContent = result;
      loadingEl.classList.add('hidden');
      resultAreaEl.classList.remove('hidden');
    } catch (err) {
      loadingEl.textContent = 'Erreur: ' + err.message;
    }
  });
});

// Copy button
document.getElementById('copy-btn').addEventListener('click', () => {
  if (window.tlw && resultText) {
    window.tlw.copyToClipboard(resultText);
  }
});

// Insert/Coller button
document.getElementById('insert-btn').addEventListener('click', () => {
  if (window.tlw && resultText) {
    window.tlw.insertText(resultText);
  }
});
