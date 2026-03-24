const { getConfig } = require('./config');
const { log } = require('./logger');

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Bubble actions (dictation context) ──────────────────────
// Text comes from STT — may have transcription errors

// ─── Translation prompt builder ─────────────────────────────

function buildTranslatePrompt(text, context) {
  const config = getConfig();
  const native = config.nativeLanguage || 'French';
  const target = config.targetLanguage || 'English';

  if (context === 'bubble') {
    // Dictation: user spoke in native language, translate to target
    return `Translate the following text to ${target}. No formatting, no introduction, return ONLY the translation.\n\nText:\n${text}`;
  }
  // Overlay: detect language and translate in the right direction
  return `Detect the language of the following text. If it is ${native}, translate it to ${target}. Otherwise, translate it to ${native}. No formatting, no introduction, return ONLY the translation.\n\nText:\n${text}`;
}

// ─── Action resolution ───────────────────────────────────────
// Translate is built-in; all other actions come from config.customActions

function getActions() {
  const config = getConfig();
  const actions = {};

  // Built-in: translate (always first)
  actions.translate = {
    label: 'Trad',
    builtin: true,
    buildPrompt: (text, context) => buildTranslatePrompt(text, context),
  };

  // Custom actions from config
  for (const action of (config.customActions || [])) {
    actions[action.id] = {
      label: action.label,
      buildPrompt: (text) => `${action.prompt}\n\nText:\n${text}`,
    };
  }

  return actions;
}

// ─── Gemini API call ─────────────────────────────────────────

async function callGemini(prompt) {
  const config = getConfig();
  const apiKey = config.geminiApiKey;

  if (!apiKey) {
    throw new Error('Gemini API key not configured. Right-click tray > Configure Gemini API key.');
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
  const actions = getActions();
  const action = actions[actionId];
  if (!action) throw new Error(`Unknown action: ${actionId}`);
  log(`[Gemini] Bubble action: ${action.label}`);
  return callGemini(action.buildPrompt(text, 'bubble'));
}

async function processOverlayAction(text, actionId) {
  const actions = getActions();
  const action = actions[actionId];
  if (!action) throw new Error(`Unknown action: ${actionId}`);
  log(`[Gemini] Overlay action: ${action.label}`);
  return callGemini(action.buildPrompt(text, 'overlay'));
}

async function processCustomPrompt(text, customPrompt) {
  return callGemini(`${customPrompt}\n\nTexte :\n${text}`);
}

module.exports = {
  getActions,
  processBubbleAction,
  processOverlayAction,
  processCustomPrompt,
  callGemini,
};
