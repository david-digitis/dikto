# DIKTO

Desktop dictaphone with local STT + AI-powered text processing (translation, correction, email writing). Cross-platform (Windows 11 + Linux Fedora/Wayland). v0.3.0.

## Stack technique

- **Framework** : Electron 33 (main + renderer processes)
- **Langage** : JavaScript/Node.js
- **STT** : sherpa-onnx-node v1.12.32 — dual engine: Parakeet TDT v3 (~50ms) + Whisper Turbo (~2s)
- **IA cloud** : Gemini 2.5 Flash Lite (API REST, header x-goog-api-key)
- **Audio** : Web Audio API via hidden BrowserWindow (MediaDevices + ScriptProcessor)
- **Clipboard** : electron clipboard module
- **Auto-paste** : VBScript (cscript, Windows) / dotool (Linux/Wayland)
- **Hotkeys** : uiohook-napi (Windows) / evdev direct /dev/input/ (Linux/Wayland)
- **Config** : electron safeStorage (cle API chiffree)
- **Packaging** : electron-builder (.exe portable + NSIS installer Windows, .AppImage Linux)

## Architecture

```
DIKTO/
├── main.js                 # Main process — orchestration, hotkeys, windows
├── preload.js              # Bridge IPC securise (contextBridge)
├── preload-audio.js        # Bridge IPC pour audio worker
├── paste.vbs               # VBScript auto-genere pour Ctrl+V rapide (Windows only)
├── afterPack.js            # electron-builder hook: wrapper script Linux (--no-sandbox)
├── package.json
├── src/
│   ├── stt.js              # Dual STT engine (Parakeet + Whisper, auto-switch par duree)
│   ├── recorder.js         # Capture audio (hidden window + MediaDevices)
│   ├── gemini.js           # Client Gemini — getActions() lit depuis config, translate built-in
│   ├── config.js           # Config store (safeStorage, customActions, language pair)
│   ├── tray.js             # Tray icon + menu complet (micro, modeles, modes, langues, seuil)
│   ├── paste.js            # Clipboard + auto-paste VBScript/dotool
│   ├── models.js           # Download/gestion modeles STT
│   ├── sounds.js           # Beeps feedback (start, done, error)
│   ├── clipboard-history.js # Clipboard history manager (text + images)
│   ├── logger.js           # File logger (debug.log in userData)
│   ├── platform.js         # Abstractions OS (detection terminal, Wayland/X11)
│   └── hotkeys-linux.js    # Linux hotkeys via evdev (Wayland compatible)
├── ui/
│   ├── audio-worker.html   # Hidden window pour capture micro
│   ├── bubble/             # Bubble oscilloscope + boutons action dynamiques
│   ├── overlay/            # Overlay IA (double Ctrl+C) + boutons dynamiques
│   ├── models/             # Gestionnaire de modeles STT
│   ├── modes-editor/       # Editeur de modes d'action custom
│   ├── clipboard/          # Clipboard history UI (Ctrl+B)
│   └── onboarding/         # Premier lancement (cle API, micro, raccourcis)
├── docs/                   # Screenshots pour README GitHub
└── CLAUDE.md
```

## Fonctionnalites (v0.3.0)

### Dictaphone push-to-talk
- Hold Ctrl+Space -> enregistre, release -> transcrit -> colle automatiquement
- Dual engine : Parakeet TDT v3 (< seuil) / Whisper Turbo (>= seuil, configurable)
- Auto-paste via VBScript (Windows) / dotool (Linux/Wayland)
- Tray icon 3 etats (idle gris, recording rouge, busy orange)
- Sons feedback (beep start, double beep done, buzz error)

### Bubble avec actions IA
- Bubble oscilloscope animee pendant enregistrement
- Boutons d'action generes dynamiquement depuis config.customActions
- Trad (built-in, icone globe) toujours present + modes custom
- Premier clic verrouille le choix, transcription + Gemini au release
- Si aucun bouton clique : transcription brute

### Double Ctrl+C (overlay)
- Selectionner du texte, Ctrl+C Ctrl+C rapide (<400ms)
- Overlay dark centre avec boutons dynamiques (memes que la bubble)
- Resultat affiche -> Copy ou Paste
- Escape pour fermer

### Smart translate (DeepL-like)
- nativeLanguage + targetLanguage dans config (defaut: French/English)
- Bubble : traduit dictee vers targetLanguage
- Overlay : detecte la langue, traduit vers native ou target automatiquement
- Langues supportees : French, English, German, Spanish, Italian, Portuguese, Dutch

### Custom action modes
- Actions stockees dans config.customActions (array d'objets {id, label, prompt})
- Editeur UI : tray > Action modes... (ajouter, modifier, supprimer)
- Modes par defaut : Abc (grammaire), Mail FR, Mail EN
- Trad est built-in, pas editable, toujours present

### Clipboard history (Ctrl+B)
- Historique texte + images, recherche, navigation clavier (fleches + Enter)
- Configurable : max entries (defaut 100), toggle on/off, clear
- Images stockees dans userData/clipboard-history/images/
- Ctrl+B toggle la fenetre (via uiohook sur Windows, evdev sur Linux)

### Configuration (tray menu)
- **Transcription** : Microphone, STT Models..., Whisper switch threshold
- **Post-processing** : Action modes..., Gemini auto-correction, Native/Target language
- **Clipboard** : Clipboard history (toggle), Max entries, Clear history
- Cle API Gemini (dialog, stockee chiffree)
- Start at login (checkbox)
- Quit

### Build Windows
- Portable .exe (76 MB) + installeur NSIS (83 MB)
- `npm run build:win` ou `npx electron-builder --win portable`
- Note : winCodeSign necessite Developer Mode ou extraction manuelle du cache (bug symlinks)

### Build Linux
- AppImage (114 MB)
- `npm run build:linux`
- afterPack.js cree un wrapper script qui injecte ELECTRON_DISABLE_SANDBOX et --no-sandbox
- Pre-requis utilisateur : dotool, extension GNOME AppIndicator, membre du groupe input

## Regles de dev

- **Secrets** : Cle API Gemini via electron safeStorage, JAMAIS en clair
- **API Gemini** : Header `x-goog-api-key` (pas query string `?key=`)
- **Auto-paste** : VBScript sur Windows (cscript), dotool sur Linux/Wayland
- **Push-to-talk** : uiohook-napi sur Windows, evdev sur Linux (uiohook ne fonctionne pas sous Wayland)
- **Sandbox Linux** : chrome-sandbox n'a pas le SUID bit dans l'AppImage, donc afterPack.js cree un wrapper qui passe --no-sandbox et ELECTRON_DISABLE_SANDBOX=1
- **Focus** : Bubble non-focusable au show (showInactive). Overlay minimize avant insert pour refocus
- **Multi-ecran** : Toutes les fenetres s'ouvrent sur l'ecran du curseur (screen.getCursorScreenPoint)
- **IPC bridge** : `contextBridge.exposeInMainWorld('dikto', ...)` dans preload.js → `window.dikto.*` dans tous les UI
- **CSP** : `script-src 'self'` dans les HTML → PAS de onclick inline, utiliser addEventListener dans les .js
- **Actions dynamiques** : Bubble et overlay chargent les boutons via IPC get-actions au render
- **Logs** : debug.log dans userData (~/.config/dikto/ sur Linux, %APPDATA%/dikto/ sur Windows)
- **ELECTRON_RUN_AS_NODE** : Doit etre unset pour lancer (VS Code le set). Le .desktop file le neutralise.
- **Nom public** : David (pas de nom de famille dans le code — repo public)

## Design system

Theme unifie defini dans `ui/theme.css` :

```
--accent: #22d3ee              (turquoise)
--accent-hover: #67e8f9
--accent-text: #111115
--bg-primary: #111115
--bg-secondary: #1a1a20
--bg-tertiary: #2a2a32
--bg-input: #0d0d10
--bg-surface: rgba(255,255,255,0.06)
--border: rgba(255,255,255,0.08)
--text-primary: rgba(255,255,255,0.9)
--text-secondary: rgba(255,255,255,0.5)
--success: #22c55e
--error: #f87171
--info: #38bdf8
```

## Lancement dev

```bash
# Depuis un terminal systeme (PAS VS Code a cause de ELECTRON_RUN_AS_NODE)
cd DIKTO
npx electron .

# Sous Wayland, si probleme de sandbox renderer:
ELECTRON_DISABLE_SANDBOX=1 npx electron .
```

## Pre-requis Linux (Fedora/Wayland)

```bash
# Outils systeme
sudo dnf install dotool fuse-libs

# Groupe input (pour evdev, relancer la session apres)
sudo usermod -aG input $USER

# Extension GNOME pour le tray icon
# Installer "AppIndicator and KStatusNotifierItem Support" depuis GNOME Extensions

# Service dotool
sudo systemctl enable --now dotool.service
# OU lancer manuellement: sudo dotoold &
```

## Modeles STT

| Modele | ID config | Taille | URL |
|--------|-----------|--------|-----|
| Parakeet TDT v3 int8 | parakeet-tdt-v3-int8 | ~464 MB | sherpa-onnx releases |
| Whisper Turbo int8 | whisper-turbo | ~538 MB | sherpa-onnx releases |

Stockage : `%APPDATA%/dikto/models/` (Win) / `~/.config/dikto/models/` (Linux)

## GitHub

- Repo : https://github.com/david-digitis/dikto
- Release v0.3.0 : .exe portable + installeur NSIS (Linux AppImage a ajouter)
- Licence MIT
