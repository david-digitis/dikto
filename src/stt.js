const sherpa = require('sherpa-onnx-node');
const path = require('path');
const fs = require('fs');
const { langCode, looksLikeEnglishDrift } = require('./language-guard');

let recognizers = {};  // { modelId: recognizer }
let modelsPath = '';
let activeModelId = null;
let guardLang = 'fr';  // language the Canary guard is forced to

const PRIMARY_ID = 'parakeet-tdt-v3-int8';
const GUARD_ID = 'canary-180m-flash-int8';

// Model registry — metadata for available models
const MODEL_REGISTRY = {
  'parakeet-tdt-v3-int8': {
    name: 'Parakeet TDT v3',
    folder: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    type: 'transducer',
    files: {
      encoder: 'encoder.int8.onnx',
      decoder: 'decoder.int8.onnx',
      joiner: 'joiner.int8.onnx',
      tokens: 'tokens.txt',
    },
    downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2',
    size: 486539264,
    description: 'Fast and accurate — ideal for short segments',
    languages: ['fr', 'en'],
    precision: 75,
    speed: 98,
  },
  'canary-180m-flash-int8': {
    name: 'Canary 180M Flash',
    folder: 'sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8',
    type: 'canary',
    files: {
      encoder: 'encoder.int8.onnx',
      decoder: 'decoder.int8.onnx',
      tokens: 'tokens.txt',
    },
    downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8.tar.bz2',
    size: 153692328,
    description: 'Language guard — re-transcribes in your native language when Parakeet drifts to English',
    languages: ['fr', 'en', 'de', 'es'],
    precision: 65,
    speed: 90,
  },
};

function isModelInstalled(modelId) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) return false;
  const modelDir = path.join(modelsPath, model.folder);
  if (!fs.existsSync(modelDir)) return false;
  // Check that all required files exist
  return Object.values(model.files).every(f =>
    fs.existsSync(path.join(modelDir, f))
  );
}

function getInstalledModels() {
  return Object.entries(MODEL_REGISTRY)
    .filter(([id]) => isModelInstalled(id))
    .map(([id, info]) => ({ id, ...info, installed: true }));
}

// Parakeet is the primary engine; Canary only re-decodes clips where Parakeet
// drifted to English. "Active" always reflects Parakeet when it is loaded.
function recomputeActiveModel() {
  if (recognizers[PRIMARY_ID]) {
    activeModelId = PRIMARY_ID;
  } else {
    activeModelId = Object.keys(recognizers)[0] || null;
  }
}

function loadModel(modelId) {
  if (recognizers[modelId]) return; // Already loaded

  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const modelDir = path.join(modelsPath, model.folder);
  let rec;

  if (model.type === 'transducer') {
    rec = new sherpa.OfflineRecognizer({
      modelConfig: {
        transducer: {
          encoder: path.join(modelDir, model.files.encoder),
          decoder: path.join(modelDir, model.files.decoder),
          joiner: path.join(modelDir, model.files.joiner),
        },
        tokens: path.join(modelDir, model.files.tokens),
        numThreads: 4,
        provider: 'cpu',
      },
    });
  } else if (model.type === 'canary') {
    rec = new sherpa.OfflineRecognizer({
      modelConfig: {
        canary: {
          encoder: path.join(modelDir, model.files.encoder),
          decoder: path.join(modelDir, model.files.decoder),
          srcLang: guardLang,
          tgtLang: guardLang,
          usePnc: 1,
        },
        tokens: path.join(modelDir, model.files.tokens),
        numThreads: 4,
        provider: 'cpu',
      },
    });
  }

  recognizers[modelId] = rec;
  recomputeActiveModel();
  console.log(`[STT] Model loaded: ${model.name}`);
}

// Free a model from memory (e.g. after deletion from disk) and refresh the
// active engine. Without this, a deleted model stayed loaded and kept the
// "ACTIVE" badge, and re-downloading it early-returned without reloading.
function unloadModel(modelId) {
  if (recognizers[modelId]) {
    delete recognizers[modelId];
    recomputeActiveModel();
    console.log(`[STT] Model unloaded: ${MODEL_REGISTRY[modelId]?.name || modelId}`);
  }
}

// Point the Canary guard at the user's native language (rebuilds it if loaded)
function setGuardLanguage(languageName) {
  const code = langCode(languageName) || 'fr';
  if (code === guardLang) return;
  guardLang = code;
  if (recognizers[GUARD_ID]) {
    delete recognizers[GUARD_ID];
    loadModel(GUARD_ID);
  }
}

async function initSTT(modelsDir, nativeLanguage) {
  modelsPath = modelsDir;
  guardLang = langCode(nativeLanguage) || 'fr';

  // Ensure models directory exists
  if (!fs.existsSync(modelsPath)) {
    fs.mkdirSync(modelsPath, { recursive: true });
  }

  // Load all installed models (primary + language guard)
  for (const modelId of [PRIMARY_ID, GUARD_ID]) {
    if (isModelInstalled(modelId)) {
      loadModel(modelId);
    }
  }

  // Set Parakeet as default active (fastest), fallback to whatever is loaded
  recomputeActiveModel();

  if (Object.keys(recognizers).length === 0) {
    throw new Error('No STT model installed. Please download a model first.');
  }

  const loaded = Object.keys(recognizers).map(id => MODEL_REGISTRY[id].name);
  console.log(`[STT] Engines: ${loaded.join(' + ') || 'none'}`);
}

function decode(modelId, audioSamples) {
  const recognizer = recognizers[modelId];
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: 16000, samples: audioSamples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  return result.text ? result.text.trim() : '';
}

// Returns { text, guarded, original } — guarded=true when Canary replaced a
// Parakeet result that had drifted to English.
async function transcribe(audioSamples) {
  if (!activeModelId) {
    throw new Error('STT not initialized — no model loaded');
  }

  const text = decode(activeModelId, audioSamples);
  const guardUsable = activeModelId !== GUARD_ID && recognizers[GUARD_ID] && guardLang !== 'en';
  if (!guardUsable || !looksLikeEnglishDrift(text, guardLang)) {
    return { text, guarded: false };
  }

  const retry = decode(GUARD_ID, audioSamples);
  if (!retry) return { text, guarded: false };
  return { text: retry, guarded: true, original: text };
}

function getActiveModelName() {
  if (!activeModelId) return 'None';
  return MODEL_REGISTRY[activeModelId]?.name || activeModelId;
}

module.exports = {
  initSTT,
  transcribe,
  getActiveModelName,
  loadModel,
  unloadModel,
  setGuardLanguage,
  isModelInstalled,
  getInstalledModels,
  MODEL_REGISTRY,
};
