const sherpa = require('sherpa-onnx-node');
const path = require('path');
const fs = require('fs');

let recognizer = null;
let modelsPath = '';
let activeModelId = null;

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
    description: 'Rapide et precis — ideal pour segments courts',
    languages: ['fr', 'en'],
    precision: 75,
    speed: 98,
  },
  'whisper-large-v3-turbo': {
    name: 'Whisper Large v3 Turbo',
    folder: 'sherpa-onnx-whisper-large-v3-turbo',
    type: 'whisper',
    files: {
      encoder: 'large-v3-turbo-encoder.int8.onnx',
      decoder: 'large-v3-turbo-decoder.int8.onnx',
      tokens: 'large-v3-turbo-tokens.txt',
    },
    downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-large-v3-turbo.tar.bz2',
    size: 857000000,
    description: 'Precis sur segments longs — multilingue',
    languages: ['multilingual'],
    precision: 90,
    speed: 45,
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

function loadModel(modelId) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const modelDir = path.join(modelsPath, model.folder);

  if (model.type === 'transducer') {
    recognizer = new sherpa.OfflineRecognizer({
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
  } else if (model.type === 'whisper') {
    recognizer = new sherpa.OfflineRecognizer({
      modelConfig: {
        whisper: {
          encoder: path.join(modelDir, model.files.encoder),
          decoder: path.join(modelDir, model.files.decoder),
          language: 'fr',
        },
        tokens: path.join(modelDir, model.files.tokens),
        numThreads: 4,
        provider: 'cpu',
      },
    });
  }

  activeModelId = modelId;
  console.log(`[STT] Model loaded: ${model.name}`);
}

async function initSTT(modelsDir) {
  modelsPath = modelsDir;

  // Ensure models directory exists
  if (!fs.existsSync(modelsPath)) {
    fs.mkdirSync(modelsPath, { recursive: true });
  }

  // Try to load Parakeet first, then Whisper
  const preferredOrder = ['parakeet-tdt-v3-int8', 'whisper-large-v3-turbo'];
  for (const modelId of preferredOrder) {
    if (isModelInstalled(modelId)) {
      loadModel(modelId);
      return;
    }
  }

  throw new Error('No STT model installed. Please download a model first.');
}

async function transcribe(audioSamples, durationSecs) {
  if (!recognizer) {
    throw new Error('STT not initialized — no model loaded');
  }

  // TODO: If dual engine, switch based on duration
  // For MVP1, use whatever model is loaded

  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: 16000, samples: audioSamples });
  recognizer.decode(stream);

  const result = recognizer.getResult(stream);
  return result.text ? result.text.trim() : '';
}

function getActiveModelName() {
  if (!activeModelId) return 'Aucun';
  return MODEL_REGISTRY[activeModelId]?.name || activeModelId;
}

module.exports = {
  initSTT,
  transcribe,
  getActiveModelName,
  loadModel,
  isModelInstalled,
  getInstalledModels,
  MODEL_REGISTRY,
};
