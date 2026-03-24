# Instructions pour l'adaptation Linux (Fedora/Wayland)

## Contexte

The Last Whisper est une app Electron qui combine :
- **Dictaphone push-to-talk** : Hold Ctrl+Space -> STT local (Parakeet/sherpa-onnx) -> auto-paste
- **Assistant IA** : Double Ctrl+C sur du texte -> overlay avec actions Gemini (correction, traduction, email)

La version Windows est fonctionnelle et testee. Cette page documente tout ce qu'il faut adapter pour Linux Fedora avec GNOME/Wayland.

## Stack actuelle (Windows)

- Electron 33 (main + renderer)
- sherpa-onnx-node v1.12.32 (STT local, CPU)
- uiohook-napi (push-to-talk hold/release + double Ctrl+C)
- Web Audio API (capture micro via hidden BrowserWindow)
- VBScript/cscript (auto-paste Ctrl+V)
- Gemini 2.5 Flash Lite (API cloud pour correction/traduction)
- electron safeStorage (stockage cle API chiffree)

## Ce qui doit changer pour Linux

### 1. Auto-paste (CRITIQUE)

**Windows** : `cscript paste.vbs` qui execute `SendKeys "^v"`

**Linux** : Utiliser `xdotool` (X11) ou `ydotool` (Wayland)

Le code est deja prepare dans `src/paste.js` — la branche Linux utilise :
```
xdotool key ctrl+v       # X11 / XWayland
ydotool key 29:1 47:1 47:0 29:0  # Wayland natif
```

**A verifier** :
- `xdotool` fonctionne sous Wayland via XWayland ? (probablement oui sur Fedora)
- `ydotool` est installe ? Sinon : `sudo dnf install ydotool`
- Les permissions : ydotool a besoin du group `input` ou d'un service systemd

### 2. uiohook-napi (CRITIQUE)

uiohook-napi utilise des bindings natifs. Sur Linux :
- Il a besoin de `libx11-dev`, `libxtst-dev`, `libxinerama-dev` (ou leurs equivalents Fedora)
- Fedora : `sudo dnf install libX11-devel libXtst-devel libXinerama-devel`
- Le module a des binaires precompiles pour Linux x64, normalement `npm install` suffit

**A verifier** :
- Est-ce que uiohook-napi capture les touches sous Wayland ? Il utilise X11 sous le capot, donc ca devrait marcher via XWayland
- Si ca ne marche pas : alternative `evdev` (comme dans voice2clip original) mais necessite le groupe `input`

### 3. Audio capture

**Windows** : Hidden BrowserWindow + `navigator.mediaDevices.getUserMedia()`

**Linux** : Meme approche, devrait fonctionner directement avec PipeWire (Fedora default). Electron utilise PipeWire automatiquement pour l'audio sur les distros modernes.

**A verifier** :
- Le device ID sauvegarde sur Windows ne sera pas le meme sur Linux (normal)
- Premier lancement : l'onboarding demandera de selectionner le micro

### 4. Stockage des modeles

**Windows** : `%APPDATA%/the-last-whisper/models/`
**Linux** : `~/.local/share/the-last-whisper/models/` (gere automatiquement par `app.getPath('userData')`)

Le modele Parakeet TDT v3 int8 devra etre re-telecharge sur Linux (~464 MB). Le model manager dans l'app peut le faire.

### 5. safeStorage (cle API Gemini)

Electron `safeStorage` utilise :
- **Windows** : DPAPI (Windows Credential Manager)
- **Linux** : libsecret (GNOME Keyring)

**A verifier** : `gnome-keyring` est installe et actif (defaut sur Fedora GNOME)

### 6. Tray icon

Electron tray sur Linux GNOME necessite l'extension AppIndicator :
- `sudo dnf install gnome-shell-extension-appindicator`
- Ou utiliser `libappindicator-gtk3`

Sans ca, le tray icon peut ne pas apparaitre. L'app fonctionne quand meme (les hotkeys marchent).

### 7. paste.vbs

Le fichier `paste.vbs` est genere automatiquement et n'est utilise que sur Windows. Sur Linux, `src/paste.js` utilise xdotool/ydotool. Pas besoin de toucher a ce fichier.

## Installation Linux

```bash
# Pre-requis systeme
sudo dnf install libX11-devel libXtst-devel libXinerama-devel ydotool gnome-shell-extension-appindicator

# Cloner/copier le projet
cd THE-LAST-WHISPER

# Supprimer node_modules Windows et reinstaller
rm -rf node_modules
npm install

# Telecharger le modele Parakeet (si pas deja fait)
# Le model manager dans l'app peut le faire, ou manuellement :
mkdir -p ~/.local/share/the-last-whisper/models
cd ~/.local/share/the-last-whisper/models
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2 | tar xjf -

# Lancer
npx electron .
```

## Build Linux (AppImage)

```bash
# Si electron-builder fonctionne
npx electron-builder --linux AppImage

# Sinon, utiliser electron-packager
npx electron-packager . "The Last Whisper" --platform=linux --arch=x64 --out=dist --overwrite
```

## Points d'attention specifiques Wayland

1. **Positionnement des fenetres** : Wayland ne permet pas aux apps de positionner librement leurs fenetres. La bubble et l'overlay POURRAIENT etre positionnees par le window manager au lieu de l'emplacement demande. Solution possible : `gtk-layer-shell` ou accepter le positionnement par defaut.

2. **Focus/blur** : `showInactive()` de la bubble peut ne pas fonctionner comme sur Windows sous Wayland. A tester.

3. **Clipboard** : `electron.clipboard` devrait fonctionner via XWayland. Si problemes, utiliser `wl-copy` comme fallback (c'est ce que fait voice2clip).

## Fichiers a adapter (si necessaire)

| Fichier | Adaptation |
|---------|-----------|
| `src/paste.js` | Deja prepare. Tester xdotool/ydotool |
| `src/platform.js` | Detection terminal Linux (xdotool getactivewindow) |
| `src/recorder.js` | Rien normalement (WebAudio + PipeWire) |
| `src/config.js` | Rien (electron safeStorage + libsecret) |
| `src/tray.js` | Rien (tester AppIndicator) |
| `main.js` | Rien (uiohook-napi devrait marcher via XWayland) |

## Ce qui ne change PAS

- `src/stt.js` — sherpa-onnx-node est cross-platform
- `src/gemini.js` — appels API identiques
- `ui/` — tout le HTML/CSS/JS est identique
- `preload.js`, `preload-audio.js` — identiques
- Les prompts Gemini, les actions, le flow — tout identique

## Projet source de reference

voice2clip (le projet Linux original) est dans :
`C:\Users\David\JSCODE-PROJECT\SYNOLOGY-HOME\LINUX-MIGRATION\voice2clip`

Il utilise Python/GTK3/PipeWire/evdev. La logique metier (push-to-talk, transcription) est la meme. Utile comme reference si un composant Linux ne marche pas dans Electron.
