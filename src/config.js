const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

let config = {
  geminiApiKey: '',
  modelsPath: '',
  activeModel: 'parakeet-tdt-v3-int8',
  switchThreshold: 10, // seconds — switch from Parakeet to Whisper
  nativeLanguage: 'French',
  targetLanguage: 'English',
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

      // Decrypt API key if stored encrypted
      if (saved.geminiApiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(saved.geminiApiKeyEncrypted, 'base64');
        saved.geminiApiKey = safeStorage.decryptString(buffer);
        delete saved.geminiApiKeyEncrypted;
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

  // Encrypt API key before saving
  if (toSave.geminiApiKey && safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(toSave.geminiApiKey);
    toSave.geminiApiKeyEncrypted = encrypted.toString('base64');
    delete toSave.geminiApiKey;
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
  if (key === 'geminiApiKey') {
    config.geminiApiKey = value;
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
