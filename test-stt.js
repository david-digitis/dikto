/**
 * Test script: verify sherpa-onnx-node works on this machine.
 *
 * Usage:
 *   1. Download a model first (Parakeet TDT v3 recommended)
 *   2. Run: node test-stt.js <path-to-model-dir>
 *
 * Example:
 *   node test-stt.js ./models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8
 */

try {
  const sherpa = require('sherpa-onnx-node');
  console.log('[OK] sherpa-onnx-node loaded successfully');
  console.log('[INFO] Version:', sherpa.version ? sherpa.version() : 'unknown');
  console.log('[INFO] Available exports:', Object.keys(sherpa).join(', '));

  // If a model path is provided, try to load it
  const modelDir = process.argv[2];
  if (modelDir) {
    const path = require('path');
    const fs = require('fs');

    if (!fs.existsSync(modelDir)) {
      console.log(`[SKIP] Model directory not found: ${modelDir}`);
      console.log('[INFO] Download a model to test transcription');
      process.exit(0);
    }

    console.log(`[INFO] Loading model from: ${modelDir}`);

    // Detect model type by files present
    const files = fs.readdirSync(modelDir);
    const hasJoiner = files.some(f => f.includes('joiner'));

    let recognizer;

    if (hasJoiner) {
      // Transducer model (Parakeet)
      const encoder = files.find(f => f.includes('encoder'));
      const decoder = files.find(f => f.includes('decoder'));
      const joiner = files.find(f => f.includes('joiner'));
      const tokens = files.find(f => f.includes('tokens'));

      console.log(`[INFO] Transducer model detected: ${encoder}, ${decoder}, ${joiner}`);

      recognizer = new sherpa.OfflineRecognizer({
        modelConfig: {
          transducer: {
            encoder: path.join(modelDir, encoder),
            decoder: path.join(modelDir, decoder),
            joiner: path.join(modelDir, joiner),
          },
          tokens: path.join(modelDir, tokens),
          numThreads: 4,
          provider: 'cpu',
        },
      });
    } else {
      // Whisper model
      const encoder = files.find(f => f.includes('encoder'));
      const decoder = files.find(f => f.includes('decoder'));
      const tokens = files.find(f => f.includes('tokens'));

      console.log(`[INFO] Whisper model detected: ${encoder}, ${decoder}`);

      recognizer = new sherpa.OfflineRecognizer({
        modelConfig: {
          whisper: {
            encoder: path.join(modelDir, encoder),
            decoder: path.join(modelDir, decoder),
            language: 'fr',
          },
          tokens: path.join(modelDir, tokens),
          numThreads: 4,
          provider: 'cpu',
        },
      });
    }

    console.log('[OK] Model loaded successfully!');

    // Generate a short silence to test the pipeline
    const sampleRate = 16000;
    const duration = 1; // 1 second of silence
    const samples = new Float32Array(sampleRate * duration);

    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate, samples });
    recognizer.decode(stream);

    const result = stream.result;
    console.log(`[OK] Transcription pipeline works! Result: "${result.text || '(empty — expected for silence)'}"`);
    console.log('\n=== ALL TESTS PASSED ===');
    console.log('sherpa-onnx-node is fully functional on this machine.');

  } else {
    console.log('\n[INFO] To test transcription, run:');
    console.log('  node test-stt.js <path-to-model-dir>');
    console.log('\nExample:');
    console.log('  node test-stt.js ./models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8');
  }

} catch (err) {
  console.error('[FAIL]', err.message);
  console.error('\nFull error:', err);
  process.exit(1);
}
