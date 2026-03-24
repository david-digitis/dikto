const bubble = document.getElementById('bubble');
const actionsContainer = document.getElementById('actions');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('oscilloscope');
const ctx = canvas.getContext('2d');

let animationId = null;
let barValues = new Array(14).fill(0);
let barTargets = new Array(14).fill(0);
let selectedAction = null;
let actionLocked = false;

// ─── Load action buttons dynamically ─────────────────────────

async function loadActions() {
  if (!window.tlw) return;
  const actions = await window.tlw.getActions();
  actionsContainer.innerHTML = '';

  actions.forEach(a => {
    const btn = document.createElement('button');
    btn.className = 'action-btn' + (a.builtin ? ' builtin' : '');
    btn.dataset.action = a.id;
    btn.textContent = a.label;
    btn.addEventListener('click', onActionClick);
    actionsContainer.appendChild(btn);
  });
}

function onActionClick(e) {
  e.stopPropagation();
  if (actionLocked) return;

  const btn = e.currentTarget;
  selectedAction = btn.dataset.action;
  actionLocked = true;

  actionsContainer.querySelectorAll('.action-btn').forEach(b => {
    if (b === btn) {
      b.classList.add('selected');
    } else {
      b.style.display = 'none';
    }
  });

  statusEl.textContent = 'OK — release Ctrl+Space';
  statusEl.classList.remove('hidden');

  if (window.tlw) {
    window.tlw.sendAction(selectedAction);
  }
}

loadActions();

// Show action buttons after 500ms of recording
setTimeout(() => {
  actionsContainer.classList.remove('hidden');
  bubble.classList.remove('compact');
  bubble.classList.add('expanded');
}, 500);

// ─── Oscilloscope animation ──────────────────────────────────

function animate() {
  const width = canvas.width;
  const height = canvas.height;
  const barCount = 14;
  const barWidth = 8;
  const gap = 4;
  const totalWidth = barCount * (barWidth + gap) - gap;
  const offsetX = (width - totalWidth) / 2;

  ctx.clearRect(0, 0, width, height);

  const time = Date.now() / 1000;

  for (let i = 0; i < barCount; i++) {
    const sin1 = Math.sin(time * 3 + i * 0.7) * 0.5 + 0.5;
    const sin2 = Math.sin(time * 5.3 + i * 1.1) * 0.3 + 0.5;
    const rand = Math.random() * 0.2;
    barTargets[i] = Math.min(1, sin1 * 0.5 + sin2 * 0.3 + rand + 0.15);

    barValues[i] += (barTargets[i] - barValues[i]) * 0.15;

    const barHeight = Math.max(3, barValues[i] * (height - 4));
    const x = offsetX + i * (barWidth + gap);
    const y = (height - barHeight) / 2;

    const hue = 140 + (i / barCount) * 40;
    ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 3);
    ctx.fill();
  }

  animationId = requestAnimationFrame(animate);
}

animate();

// ─── Events from main process ────────────────────────────────

if (window.tlw) {
  window.tlw.onRecordingStop(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    canvas.style.opacity = '0.3';

    if (selectedAction) {
      statusEl.textContent = 'Transcription + Gemini...';
    } else {
      statusEl.textContent = 'Transcription...';
    }
    statusEl.classList.remove('hidden');
    actionsContainer.classList.add('hidden');
  });

  window.tlw.onRecordingStart(() => {
    selectedAction = null;
    actionLocked = false;
    canvas.style.opacity = '1';
    statusEl.classList.add('hidden');

    // Reload actions (may have changed) and reset
    loadActions();

    // Restart animation
    if (!animationId) animate();

    // Show buttons after 500ms
    actionsContainer.classList.add('hidden');
    setTimeout(() => {
      actionsContainer.classList.remove('hidden');
      bubble.classList.remove('compact');
      bubble.classList.add('expanded');
    }, 500);
  });
}
