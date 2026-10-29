// Moteur STT cloud : ElevenLabs Scribe v2.
// Le clip (Float32 16 kHz mono) est envoye en PCM 16 bits brut, le format
// documente comme le plus rapide cote serveur. La langue native est forcee :
// pas de derive vers l'anglais possible, contrairement a Parakeet.
const { getConfig } = require('./config');
const { log } = require('./logger');

const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL_ID = 'scribe_v2';
const TIMEOUT_MS = 12000;

// Nom de langue de la config -> ISO-639-1 attendu par l'API
const LANG_CODES = {
  French: 'fr', English: 'en', German: 'de', Spanish: 'es',
  Italian: 'it', Portuguese: 'pt', Dutch: 'nl',
};

function float32ToPcm16(samples) {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  return buf;
}

function isConfigured() {
  return Boolean(getConfig().elevenLabsApiKey);
}

// Returns { text, languageCode, languageProbability }
async function transcribeElevenLabs(samples) {
  const config = getConfig();
  const apiKey = config.elevenLabsApiKey;
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured. Tray > Configure ElevenLabs API key.');
  }

  const form = new FormData();
  form.append('model_id', MODEL_ID);
  form.append('file_format', 'pcm_s16le_16');
  form.append('tag_audio_events', 'false');
  form.append('diarize', 'false');
  const lang = LANG_CODES[config.nativeLanguage];
  if (lang) form.append('language_code', lang);
  form.append('file', new Blob([float32ToPcm16(samples)], { type: 'application/octet-stream' }), 'clip.pcm');

  const response = await fetch(ELEVENLABS_URL, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = (data.text || '').trim();
  log(`[ElevenLabs] lang=${data.language_code} p=${Number(data.language_probability || 0).toFixed(2)}`);
  return { text, languageCode: data.language_code, languageProbability: data.language_probability };
}

module.exports = { transcribeElevenLabs, isConfigured, LANG_CODES };
