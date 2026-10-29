const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Cles API chiffrees via safeStorage (stockees sous <key>Encrypted dans le JSON)
const SECRET_KEYS = ['geminiApiKey', 'elevenLabsApiKey'];

let config = {
  geminiApiKey: '',
  elevenLabsApiKey: '',
  sttEngine: 'local', // 'local' (Parakeet) | 'elevenlabs' (Scribe v2 cloud)
  modelsPath: '',
  activeModel: 'parakeet-tdt-v3-int8',
  muteWhileRecording: false, // couper le son systeme pendant la dictee
  nativeLanguage: 'French',
  targetLanguage: 'English',
  customActions: [
    {
      id: 'grammar',
      label: 'Abc',
      prompt: 'Corrige les fautes d\'orthographe, de grammaire et de ponctuation du texte suivant. Ne reformule pas, ne change pas le style, ne rajoute rien. Renvoie UNIQUEMENT le texte corrige.',
    },
    {
      id: 'mail-fr',
      label: 'Mail FR',
      prompt: 'Redige un email professionnel en francais a partir du texte suivant. Detecte le ton (tutoiement/vouvoiement) et adapte la signature :\n- Si tutoiement : "Bien a toi,\\nDavid"\n- Si vouvoiement : "Cordialement,\\nDavid"\n\nRenvoie UNIQUEMENT l\'email, rien d\'autre. Pas d\'objet.',
    },
    {
      id: 'mail-en',
      label: 'Mail EN',
      prompt: 'Redige un email professionnel en anglais a partir du texte suivant. Detecte le ton :\n- Si informel : "Best,\\nDavid"\n- Si formel : "Best regards,\\nDavid"\n\nRenvoie UNIQUEMENT l\'email en anglais, rien d\'autre. Pas d\'objet.',
    },
  ],
  clipboardHistory: {
    enabled: false,
    maxEntries: 100,
  },
  autoCorrection: {
    enabled: false,
    prompt: 'Corrige les erreurs de transcription et de ponctuation, sans reformuler. Renvoie uniquement le texte corrige.',
  },
  hotkeys: {
    pushToTalk: 'CommandOrControl+Space',
  },
};

function getConfigPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'config.json');
}

function getModelsPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'models');
}

async function loadConfig() {
  config.modelsPath = getModelsPath();

  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(raw);

      // Decrypt API keys if stored encrypted
      for (const key of SECRET_KEYS) {
        const enc = saved[`${key}Encrypted`];
        if (enc && safeStorage.isEncryptionAvailable()) {
          saved[key] = safeStorage.decryptString(Buffer.from(enc, 'base64'));
        }
        delete saved[`${key}Encrypted`];
      }

      config = { ...config, ...saved, modelsPath: getModelsPath() };
    }
  } catch (err) {
    console.error('[Config] Failed to load config:', err.message);
  }

  // Ensure models directory exists
  if (!fs.existsSync(config.modelsPath)) {
    fs.mkdirSync(config.modelsPath, { recursive: true });
  }

  return config;
}

function saveConfig() {
  const configPath = getConfigPath();
  const toSave = { ...config };

  // Encrypt API keys before saving (never written in clear)
  for (const key of SECRET_KEYS) {
    if (toSave[key] && safeStorage.isEncryptionAvailable()) {
      toSave[`${key}Encrypted`] = safeStorage.encryptString(toSave[key]).toString('base64');
    }
    delete toSave[key];
  }

  // Don't save modelsPath (derived from userData)
  delete toSave.modelsPath;

  fs.writeFileSync(configPath, JSON.stringify(toSave, null, 2), 'utf-8');
  console.log('[Config] Saved');
}

function getConfig() {
  return config;
}

function setConfigValue(key, value) {
  if (SECRET_KEYS.includes(key)) {
    config[key] = value;
  } else {
    // Support nested keys like 'autoCorrection.enabled'
    const keys = key.split('.');
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }
  saveConfig();
}

module.exports = { loadConfig, saveConfig, getConfig, setConfigValue };
