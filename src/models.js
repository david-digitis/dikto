const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createHash } = require('crypto');
const { MODEL_REGISTRY, isModelInstalled } = require('./stt');
const { getConfig } = require('./config');

/**
 * Download a model archive, extract it, and verify integrity.
 *
 * @param {string} modelId - Model ID from MODEL_REGISTRY
 * @param {function} onProgress - Callback(downloaded, total, speed)
 * @returns {Promise<void>}
 */
async function downloadModel(modelId, onProgress = () => {}) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const config = getConfig();
  const modelsDir = config.modelsPath;
  const targetDir = path.join(modelsDir, model.folder);

  if (isModelInstalled(modelId)) {
    console.log(`[Models] ${model.name} already installed`);
    return;
  }

  console.log(`[Models] Downloading ${model.name} from ${model.downloadUrl}`);

  // Download to temp file
  const tempFile = path.join(modelsDir, `${modelId}.tar.bz2.tmp`);
  await downloadFile(model.downloadUrl, tempFile, onProgress);

  // Extract
  console.log(`[Models] Extracting ${model.name}...`);
  await extractTarBz2(tempFile, modelsDir);

  // Cleanup temp file
  try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }

  // Verify model files exist after extraction
  if (!isModelInstalled(modelId)) {
    throw new Error(`Model extraction failed — files not found in ${targetDir}`);
  }

  console.log(`[Models] ${model.name} installed successfully`);
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let total = 0;
    let lastTime = Date.now();
    let lastDownloaded = 0;

    function handleResponse(response) {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = response.headers.location;
        const protocol = redirectUrl.startsWith('https') ? https : http;
        protocol.get(redirectUrl, handleResponse).on('error', reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      total = parseInt(response.headers['content-length'], 10) || 0;

      response.pipe(file);
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        if (elapsed >= 0.5) {
          const speed = (downloaded - lastDownloaded) / elapsed;
          onProgress(downloaded, total, speed);
          lastTime = now;
          lastDownloaded = downloaded;
        }
      });

      response.on('end', () => {
        file.close(() => resolve());
      });
    }

    https.get(url, handleResponse).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function extractTarBz2(archivePath, destDir) {
  const { exec } = require('child_process');

  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let cmd;

    if (platform === 'win32') {
      // Try tar (available on Win10+), or 7-zip as fallback
      cmd = `tar -xjf "${archivePath}" -C "${destDir}"`;
    } else {
      cmd = `tar -xjf "${archivePath}" -C "${destDir}"`;
    }

    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Models] Extraction error:', stderr);
        reject(new Error(`Extraction failed: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

function deleteModel(modelId) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const config = getConfig();
  const targetDir = path.join(config.modelsPath, model.folder);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log(`[Models] ${model.name} deleted`);
  }
}

function listModels() {
  return Object.entries(MODEL_REGISTRY).map(([id, info]) => ({
    id,
    ...info,
    installed: isModelInstalled(id),
  }));
}

module.exports = { downloadModel, deleteModel, listModels };
