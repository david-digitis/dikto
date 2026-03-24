const { getConfig } = require('./config');
const { log } = require('./logger');

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Bubble actions (dictation context) ──────────────────────
// Text comes from STT — may have transcription errors

const BUBBLE_ACTIONS = {
  grammar: {
    label: 'Abc',
    title: 'Correction',
    buildPrompt: (text) =>
      `Corrige les fautes d'orthographe, de grammaire et de ponctuation du texte suivant. Ne reformule pas, ne change pas le style, ne rajoute rien. Renvoie UNIQUEMENT le texte corrige.\n\nTexte :\n${text}`,
  },
  translate: {
    label: 'Trad',
    title: 'Traduire en anglais',
    buildPrompt: (text) =>
      `Traduis le texte suivant en anglais. Pas de mise en forme, pas d'introduction, renvoie UNIQUEMENT la traduction.\n\nTexte :\n${text}`,
  },
  'mail-fr': {
    label: 'Mail FR',
    title: 'Email francais',
    buildPrompt: (text) =>
      `Redige un email professionnel en francais a partir du texte suivant. Detecte le ton (tutoiement/vouvoiement) et adapte la signature :\n- Si tutoiement : "Bien a toi,\\nDavid"\n- Si vouvoiement : "Cordialement,\\nDavid Bertrand"\n\nRenvoie UNIQUEMENT l'email, rien d'autre. Pas d'objet.\n\nTexte :\n${text}`,
  },
  'mail-en': {
    label: 'Mail EN',
    title: 'Email anglais',
    buildPrompt: (text) =>
      `Traduis le texte francais suivant en un email professionnel en anglais. Detecte le ton :\n- Si informel : "Best,\\nDavid"\n- Si formel : "Best regards,\\nDavid Bertrand"\n\nRenvoie UNIQUEMENT l'email en anglais, rien d'autre. Pas d'objet.\n\nTexte :\n${text}`,
  },
};

// ─── Overlay actions (selection/double Ctrl+C context) ───────
// Text is already written — could be FR or EN

const OVERLAY_ACTIONS = {
  grammar: {
    label: 'Abc',
    title: 'Correction',
    buildPrompt: (text) =>
      `Corrige les fautes d'orthographe et de grammaire du texte suivant SANS le reformuler, SANS changer le style, SANS ajouter de contenu. Renvoie UNIQUEMENT le texte corrige.\n\nTexte :\n${text}`,
  },
  translate: {
    label: 'Trad',
    title: 'Traduire',
    buildPrompt: (text) =>
      `Detecte la langue du texte suivant. Si c'est du francais, traduis-le en anglais. Si c'est de l'anglais, traduis-le en francais. Pas de mise en forme, pas d'introduction, renvoie UNIQUEMENT la traduction.\n\nTexte :\n${text}`,
  },
  'mail-fr': {
    label: 'Mail FR',
    title: 'Email francais',
    buildPrompt: (text) =>
      `Redige un email professionnel en francais a partir du texte suivant. Detecte le ton (tutoiement/vouvoiement) et adapte la signature :\n- Si tutoiement : "Bien a toi,\\nDavid"\n- Si vouvoiement : "Cordialement,\\nDavid Bertrand"\n\nRenvoie UNIQUEMENT l'email, rien d'autre. Pas d'objet.\n\nTexte :\n${text}`,
  },
  'mail-en': {
    label: 'Mail EN',
    title: 'Email anglais',
    buildPrompt: (text) =>
      `Redige un email professionnel en anglais a partir du texte suivant. Detecte le ton :\n- Si informel : "Best,\\nDavid"\n- Si formel : "Best regards,\\nDavid Bertrand"\n\nRenvoie UNIQUEMENT l'email en anglais, rien d'autre. Pas d'objet.\n\nTexte :\n${text}`,
  },
};

// ─── Gemini API call ─────────────────────────────────────────

async function callGemini(prompt) {
  const config = getConfig();
  const apiKey = config.geminiApiKey;

  if (!apiKey) {
    throw new Error('Cle API Gemini non configuree. Clic droit sur le tray > Configurer cle API.');
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned empty response');
  }

  return text.trim();
}

async function processBubbleAction(text, actionId) {
  const action = BUBBLE_ACTIONS[actionId];
  if (!action) throw new Error(`Unknown bubble action: ${actionId}`);
  log(`[Gemini] Bubble action: ${action.title}`);
  return callGemini(action.buildPrompt(text));
}

async function processOverlayAction(text, actionId) {
  const action = OVERLAY_ACTIONS[actionId];
  if (!action) throw new Error(`Unknown overlay action: ${actionId}`);
  log(`[Gemini] Overlay action: ${action.title}`);
  return callGemini(action.buildPrompt(text));
}

async function processCustomPrompt(text, customPrompt) {
  return callGemini(`${customPrompt}\n\nTexte :\n${text}`);
}

module.exports = {
  BUBBLE_ACTIONS,
  OVERLAY_ACTIONS,
  processBubbleAction,
  processOverlayAction,
  processCustomPrompt,
  callGemini,
};
