const listEl = document.getElementById('modes-list');
let actions = [];
let editingId = null;

// Close
document.getElementById('close-btn').addEventListener('click', () => {
  window.tlw.closeModesEditor();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.tlw.closeModesEditor();
});

// Add button
document.getElementById('add-btn').addEventListener('click', () => {
  const id = 'custom-' + Date.now();
  actions.push({ id, label: 'New', prompt: '' });
  editingId = id;
  render();
});

async function load() {
  actions = await window.tlw.getCustomActions();
  render();
}

function render() {
  listEl.innerHTML = '';

  actions.forEach((action, index) => {
    const card = document.createElement('div');
    card.className = 'mode-card' + (editingId === action.id ? ' editing' : '');

    if (editingId === action.id) {
      card.innerHTML = `
        <div class="edit-form">
          <label>Button label</label>
          <input type="text" id="edit-label" value="${escapeHtml(action.label)}" maxlength="12" placeholder="e.g. Resume" />
          <label>Prompt (instruction sent to Gemini — the text will be appended automatically)</label>
          <textarea id="edit-prompt" placeholder="e.g. Summarize the following text in 3 bullet points...">${escapeHtml(action.prompt)}</textarea>
          <div class="edit-buttons">
            <button class="btn-cancel" id="cancel-edit">Cancel</button>
            <button class="btn-save" id="save-edit">Save</button>
          </div>
        </div>
      `;

      card.querySelector('#cancel-edit').addEventListener('click', () => {
        // If it's a new empty mode, remove it
        if (!action.prompt && action.label === 'New') {
          actions = actions.filter(a => a.id !== action.id);
        }
        editingId = null;
        render();
      });

      card.querySelector('#save-edit').addEventListener('click', () => {
        const label = card.querySelector('#edit-label').value.trim();
        const prompt = card.querySelector('#edit-prompt').value.trim();
        if (!label || !prompt) return;
        action.label = label;
        action.prompt = prompt;
        editingId = null;
        save();
      });

      // Auto-focus the label if it's "New"
      setTimeout(() => {
        const input = card.querySelector('#edit-label');
        if (input && action.label === 'New') input.select();
      }, 50);

    } else {
      card.innerHTML = `
        <div class="mode-header">
          <span class="mode-label-display">${escapeHtml(action.label)}</span>
        </div>
        <div class="mode-prompt-preview">${escapeHtml(action.prompt)}</div>
        <div class="mode-actions"></div>
      `;

      const actionsEl = card.querySelector('.mode-actions');

      const editBtn = document.createElement('button');
      editBtn.className = 'btn-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        editingId = action.id;
        render();
      });
      actionsEl.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        actions = actions.filter(a => a.id !== action.id);
        save();
      });
      actionsEl.appendChild(delBtn);
    }

    listEl.appendChild(card);
  });
}

async function save() {
  await window.tlw.saveCustomActions(actions);
  render();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

load();
