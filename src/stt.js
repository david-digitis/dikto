const sherpa = require('sherpa-onnx-node');
const path = require('path');
const fs = require('fs');
const { log } = require('./logger');

let recognizers = {};  // { modelId: recognizer }
let modelsPath = '';
let activeModelId = null;

const PRIMARY_ID = 'parakeet-tdt-v3-int8';
const SAMPLE_RATE = 16000;

// Les modeles NeMo (TDT) emettent mieux le premier et le dernier token quand le
// clip est encadre de silence : un push-to-talk coupe net au relachement, on
// rajoute donc du silence synthetique. Cout : quelques ms de decodage.
const PAD_HEAD_S = 0.15;
const PAD_TAIL_S = 0.45;

// Ancien garde-langue Canary (retire en v0.4) : on nettoie le dossier des
// installations existantes, 200 Mo de modele orphelin sinon.
const LEGACY_FOLDERS = ['sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8'];

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
    description: 'Fast and accurate — 25 European languages, auto-detected',
    languages: ['fr', 'en', 'de', 'es', 'it', 'pt', 'nl'],
    precision: 75,
    speed: 98,
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
  const rec = new sherpa.OfflineRecognizer({
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

  recognizers[modelId] = rec;
  recomputeActiveModel();
  console.log(`[STT] Model loaded: ${model.name}`);
}

// Free a model from memory (e.g. after deletion from disk) and refresh the
// active engine.
function unloadModel(modelId) {
  if (recognizers[modelId]) {
    delete recognizers[modelId];
    recomputeActiveModel();
    console.log(`[STT] Model unloaded: ${MODEL_REGISTRY[modelId]?.name || modelId}`);
  }
}

function removeLegacyModels() {
  for (const folder of LEGACY_FOLDERS) {
    const dir = path.join(modelsPath, folder);
    if (!fs.existsSync(dir)) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      log(`[STT] Removed legacy model folder: ${folder}`);
    } catch (err) {
      log(`[STT] Could not remove legacy model ${folder}: ${err.message}`);
    }
  }
}

async function initSTT(modelsDir) {
  modelsPath = modelsDir;

  if (!fs.existsSync(modelsPath)) {
    fs.mkdirSync(modelsPath, { recursive: true });
  }
  removeLegacyModels();

  for (const modelId of Object.keys(MODEL_REGISTRY)) {
    if (isModelInstalled(modelId)) loadModel(modelId);
  }
  recomputeActiveModel();

  if (Object.keys(recognizers).length === 0) {
    throw new Error('No STT model installed. Please download a model first.');
  }

  const loaded = Object.keys(recognizers).map(id => MODEL_REGISTRY[id].name);
  console.log(`[STT] Engines: ${loaded.join(' + ') || 'none'}`);
}

function padWithSilence(samples) {
  const head = Math.round(PAD_HEAD_S * SAMPLE_RATE);
  const tail = Math.round(PAD_TAIL_S * SAMPLE_RATE);
  const out = new Float32Array(head + samples.length + tail);
  out.set(samples, head);
  return out;
}

function decode(modelId, audioSamples) {
  const recognizer = recognizers[modelId];
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: padWithSilence(audioSamples) });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  return result.text ? result.text.trim() : '';
}

// Returns { text }
async function transcribe(audioSamples) {
  if (!activeModelId) {
    throw new Error('STT not initialized — no model loaded');
  }
  return { text: decode(activeModelId, audioSamples) };
}

function getActiveModelName() {
  if (!activeModelId) return 'None';
  return MODEL_REGISTRY[activeModelId]?.name || activeModelId;
}

function isReady() {
  return activeModelId !== null;
}

module.exports = {
  initSTT,
  transcribe,
  isReady,
  getActiveModelName,
  loadModel,
  unloadModel,
  isModelInstalled,
  getInstalledModels,
  MODEL_REGISTRY,
};
