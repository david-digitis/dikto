/**
 * Linux hotkey listener using evdev (direct /dev/input/ read).
 * Works under Wayland — no X11 dependency.
 * Replaces uiohook-napi on Linux.
 */
const fs = require('fs');
const { log } = require('./logger');

// evdev key codes (from linux/input-event-codes.h)
const KEY_C = 46;
const KEY_SPACE = 57;
const KEY_LEFTCTRL = 29;
const KEY_RIGHTCTRL = 97;

// struct input_event: time (16 bytes on 64-bit), type (u16), code (u16), value (s32) = 24 bytes
const EVENT_SIZE = 24;
const EV_KEY = 1;

/**
 * Find the first real keyboard device (skip virtual devices like ydotool).
 */
function findKeyboard() {
  const inputDir = '/dev/input';
  const devices = fs.readdirSync(inputDir).filter(f => f.startsWith('event'));

  for (const dev of devices) {
    const devPath = `${inputDir}/${dev}`;
    try {
      // Read device name from /sys
      const sysPath = `/sys/class/input/${dev}/device/name`;
      if (!fs.existsSync(sysPath)) continue;
      const name = fs.readFileSync(sysPath, 'utf-8').trim().toLowerCase();

      // Skip virtual devices
      if (name.includes('virtual') || name.includes('dotool') || name.includes('ydotool')) continue;

      // Check if device has KEY capability by reading capabilities/key
      const capPath = `/sys/class/input/${dev}/device/capabilities/key`;
      if (!fs.existsSync(capPath)) continue;
      const capHex = fs.readFileSync(capPath, 'utf-8').trim();
      if (capHex === '0') continue;

      // Parse capability bitmap to check for Ctrl and Space
      const parts = capHex.split(' ').reverse();
      const hasBit = (bit) => {
        const wordIndex = Math.floor(bit / 64);
        const bitIndex = bit % 64;
        if (wordIndex >= parts.length) return false;
        const word = BigInt('0x' + parts[wordIndex]);
        return (word & (1n << BigInt(bitIndex))) !== 0n;
      };

      if (hasBit(KEY_LEFTCTRL) && hasBit(KEY_SPACE)) {
        log(`[Hotkeys] Found keyboard: ${name} (${devPath})`);
        return devPath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Start listening for hotkeys on the evdev device.
 * Calls the provided callbacks on push-to-talk and double Ctrl+C events.
 */
function startEvdevListener({ onRecordStart, onRecordStop, onDoubleCtrlC }) {
  const devPath = findKeyboard();
  if (!devPath) {
    log('[Hotkeys] ERROR: No keyboard found via evdev');
    return false;
  }

  const fd = fs.openSync(devPath, 'r');
  const buf = Buffer.alloc(EVENT_SIZE);

  let ctrlDown = false;
  let spaceDown = false;
  let recording = false;
  let stopPending = false;
  let lastCtrlCTime = 0;
  const DOUBLE_CC_DELAY = 400;

  function readLoop() {
    fs.read(fd, buf, 0, EVENT_SIZE, null, (err, bytesRead) => {
      if (err) {
        log(`[Hotkeys] Read error: ${err.message}`);
        return;
      }
      if (bytesRead < EVENT_SIZE) {
        readLoop();
        return;
      }

      // Parse input_event struct (64-bit): 8 sec + 8 usec + 2 type + 2 code + 4 value
      const type = buf.readUInt16LE(16);
      const code = buf.readUInt16LE(18);
      const value = buf.readInt32LE(20); // 1=press, 0=release, 2=repeat

      if (type !== EV_KEY || value === 2) {
        readLoop();
        return;
      }

      // Track Ctrl
      if (code === KEY_LEFTCTRL || code === KEY_RIGHTCTRL) {
        ctrlDown = value > 0;
      }

      // Ctrl+Space press → start recording
      if (code === KEY_SPACE && value === 1 && ctrlDown && !recording) {
        spaceDown = true;
        recording = true;
        stopPending = false;
        onRecordStart();
      }

      // Space or Ctrl release while recording → stop (once only)
      if (recording && !stopPending && value === 0 && (code === KEY_SPACE || code === KEY_LEFTCTRL || code === KEY_RIGHTCTRL)) {
        if (code === KEY_SPACE) spaceDown = false;
        if (code === KEY_LEFTCTRL || code === KEY_RIGHTCTRL) ctrlDown = false;
        recording = false;
        spaceDown = false;
        stopPending = true;
        onRecordStop();
      }

      // Double Ctrl+C detection
      if (code === KEY_C && value === 1 && ctrlDown && !recording) {
        const now = Date.now();
        if (now - lastCtrlCTime < DOUBLE_CC_DELAY) {
          lastCtrlCTime = 0;
          onDoubleCtrlC();
        } else {
          lastCtrlCTime = now;
        }
      }

      readLoop();
    });
  }

  readLoop();
  log('[Hotkeys] evdev listener started');
  return true;
}

module.exports = { startEvdevListener, findKeyboard };
