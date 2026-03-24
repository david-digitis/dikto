# Linux setup (Fedora/Wayland)

The Last Whisper is developed and tested on Windows 11. This document covers what to check and adapt for Linux Fedora with GNOME/Wayland.

## Status

The codebase is cross-platform ready — Linux paths exist in `src/paste.js` (xdotool/ydotool) and `src/platform.js` (terminal detection). But it has **not been tested on Linux yet**. This document is a checklist for the first Linux run.

## System dependencies

```bash
sudo dnf install libX11-devel libXtst-devel libXinerama-devel ydotool gnome-shell-extension-appindicator
```

## What needs testing

### 1. Auto-paste (CRITICAL)

**Windows**: `cscript paste.vbs` (SendKeys `^v`)

**Linux**: Already coded in `src/paste.js`:

```
xdotool key ctrl+v                    # X11 / XWayland
ydotool key 29:1 47:1 47:0 29:0      # Wayland native (fallback)
```

**To verify**:

- Does `xdotool` work under Wayland via XWayland? (probably yes on Fedora)
- Is `ydotool` installed? If not: `sudo dnf install ydotool`
- Permissions: ydotool needs the `input` group or a systemd service

### 2. uiohook-napi (CRITICAL)

Native bindings for global hotkeys. On Linux:

- Needs `libX11-devel`, `libXtst-devel`, `libXinerama-devel`
- Pre-built binaries exist for Linux x64 — `npm install` should work
- Uses X11 under the hood — should work via XWayland on Wayland

**If it doesn't work**: alternative is `evdev` (like the original voice2clip project) but requires the `input` group.

### 3. Audio capture

Same approach as Windows: hidden BrowserWindow + `navigator.mediaDevices.getUserMedia()`. Should work directly with PipeWire (Fedora default). Electron uses PipeWire automatically on modern distros.

**To verify**: device IDs are different from Windows — onboarding will ask to select a mic on first launch.

### 4. STT models storage

**Windows**: `%APPDATA%/the-last-whisper/models/`
**Linux**: `~/.local/share/the-last-whisper/models/`

Handled automatically by `app.getPath('userData')`. Models must be re-downloaded on Linux (~464 MB for Parakeet, ~538 MB for Whisper Turbo). The in-app model manager handles this.

### 5. safeStorage (Gemini API key)

- **Windows**: DPAPI (Windows Credential Manager)
- **Linux**: libsecret (GNOME Keyring)

**To verify**: `gnome-keyring` is installed and active (default on Fedora GNOME).

### 6. Tray icon

Electron tray on Linux GNOME requires AppIndicator:

- `sudo dnf install gnome-shell-extension-appindicator`
- Or `libappindicator-gtk3`

Without it, the tray icon may not appear. The app still works (hotkeys are independent).

### 7. Wayland-specific concerns

1. **Window positioning**: Wayland doesn't let apps freely position windows. The bubble and overlay MAY be positioned by the window manager instead of the requested location. Possible fix: `gtk-layer-shell` or accept default positioning.
2. **Focus/blur**: `showInactive()` on the bubble may not work as expected under Wayland.
3. **Clipboard**: `electron.clipboard` should work via XWayland. If issues, use `wl-copy` as fallback.

## Installation

```bash
# Clone the repo
git clone https://github.com/david-digitis/the-last-whisper.git
cd the-last-whisper

# Install dependencies (will download Linux-native binaries for sherpa-onnx and uiohook)
npm install

# Launch
npx electron .
```

If coming from a Windows copy, delete `node_modules` first and reinstall:

```bash
rm -rf node_modules
npm install
```

## Manual model download (optional)

The in-app model manager can download models. To do it manually:

```bash
mkdir -p ~/.local/share/the-last-whisper/models
cd ~/.local/share/the-last-whisper/models
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2 | tar xjf -
```

## Build (AppImage)

```bash
npx electron-builder --linux AppImage
```

## Files that may need adaptation

| File | Status |
|------|--------|
| `src/paste.js` | Ready — has xdotool/ydotool branch. Test it. |
| `src/platform.js` | Ready — has xdotool terminal detection. Test it. |
| `src/recorder.js` | Should work (WebAudio + PipeWire). Test it. |
| `src/config.js` | Should work (safeStorage + libsecret). Test it. |
| `src/tray.js` | Should work. Test AppIndicator. |
| `main.js` | Should work (uiohook-napi via XWayland). Test it. |

## What does NOT change

- `src/stt.js` — sherpa-onnx-node is cross-platform
- `src/gemini.js` — same API calls
- `src/models.js` — same download logic
- `ui/` — all HTML/CSS/JS is identical
- `preload.js`, `preload-audio.js` — identical
- Custom action modes, language settings, prompts — all identical

## Reference project

voice2clip (the original Linux-native project) uses Python/GTK3/PipeWire/evdev. Useful as reference if an Electron component doesn't work on Linux. David has it on his Synology NAS.
