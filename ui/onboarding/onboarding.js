const apiKeyInput = document.getElementById('apiKey');
const micSelect = document.getElementById('micSelect');
const apiStatus = document.getElementById('apiStatus');

// Populate mic list on load
if (window.tlw) {
  window.tlw.onMicList((event, devices) => {
    micSelect.innerHTML = '';
    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label;
      micSelect.appendChild(opt);
    });
  });
}

function goToStep(n) {
  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.remove('active');
    if (i < n - 1) s.classList.add('done');
  });
  const step = document.getElementById(`step${n}`);
  if (step) step.classList.add('active');
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiStatus.textContent = 'Entrez une cle API';
    apiStatus.className = 'status error';
    return;
  }
  if (window.tlw) {
    window.tlw.onboardingSaveApiKey(key);
  }
  apiStatus.textContent = 'Cle enregistree';
  apiStatus.className = 'status ok';
  setTimeout(() => goToStep(2), 500);
}

function skipApiKey() {
  goToStep(2);
}

function saveMic() {
  const deviceId = micSelect.value;
  if (window.tlw && deviceId) {
    window.tlw.onboardingSaveMic(deviceId);
  }
  goToStep(3);
}

function finish() {
  if (window.tlw) {
    window.tlw.onboardingDone();
  }
}

// Enter key on API input
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveApiKey();
});
