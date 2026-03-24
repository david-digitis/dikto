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

// ─── Action buttons ──────────────────────────────────────────

document.querySelectorAll('.action-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (actionLocked) return; // Already selected, ignore

    const action = btn.dataset.action;
    selectedAction = action;
    actionLocked = true;

    // Visual: selected = orange, others disappear
    document.querySelectorAll('.action-btn').forEach(b => {
      if (b === btn) {
        b.classList.add('selected');
      } else {
        b.style.display = 'none';
      }
    });

    // Show hint — recording continues until key release
    statusEl.textContent = 'OK — relacher Ctrl+Space';
    statusEl.classList.remove('hidden');

    // Send to main process
    if (window.tlw) {
      window.tlw.sendAction(action);
    }
  });
});

// ─── Events from main process ────────────────────────────────

// When recording stops (key released), show processing state
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

  // Reset state when new recording starts
  window.tlw.onRecordingStart(() => {
    selectedAction = null;
    actionLocked = false;
    canvas.style.opacity = '1';
    statusEl.classList.add('hidden');

    // Reset buttons
    document.querySelectorAll('.action-btn').forEach(b => {
      b.classList.remove('selected');
      b.style.display = '';
      b.style.opacity = '';
    });

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
