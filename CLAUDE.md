# THE LAST WHISPER

Application desktop cross-platform (Windows 11 + Linux Fedora/Wayland) combinant dictaphone push-to-talk avec STT local et assistant IA contextuel.

## Stack technique

- **Framework** : Electron 33 (main + renderer processes)
- **Langage** : JavaScript/Node.js
- **STT** : sherpa-onnx-node v1.12.32 (Parakeet TDT v3 + Whisper Turbo)
- **IA cloud** : Gemini 2.5 Flash Lite (API REST, header x-goog-api-key)
- **Audio** : Web Audio API via hidden BrowserWindow (MediaDevices + ScriptProcessor)
- **Clipboard** : electron clipboard module
- **Auto-paste** : VBScript (cscript, Windows) / xdotool (Linux)
- **Hotkeys** : uiohook-napi (push-to-talk hold/release + double Ctrl+C detection)
- **Config** : electron safeStorage (cle API chiffree)
- **Packaging** : electron-builder (.exe Windows, .AppImage Linux)

## Architecture

```
THE-LAST-WHISPER/
├── main.js                 # Main process — orchestration, hotkeys, windows
├── preload.js              # Bridge IPC securise (contextBridge)
├── preload-audio.js        # Bridge IPC pour audio worker
├── paste.vbs               # VBScript auto-genere pour Ctrl+V rapide
├── package.json
├── src/
│   ├── stt.js              # STT engine (sherpa-onnx, model registry, transcribe)
│   ├── recorder.js         # Capture audio (hidden window + MediaDevices)
│   ├── gemini.js           # Client Gemini (bubble actions + overlay actions)
│   ├── config.js           # Config store (safeStorage pour secrets)
│   ├── tray.js             # Tray icon (3 etats) + menu (micro, Gemini, auto-corr)
│   ├── paste.js            # Clipboard + auto-paste VBScript/xdotool
│   ├── models.js           # Download/gestion modeles STT
│   ├── sounds.js           # Beeps feedback (start, done, error)
│   ├── logger.js           # File logger (debug.log)
│   └── platform.js         # Abstractions OS
├── ui/
│   ├── audio-worker.html   # Hidden window pour capture micro
│   ├── bubble/             # Bubble enregistrement + boutons action
│   ├── overlay/            # Overlay IA (double Ctrl+C)
│   ├── models/             # Gestionnaire de modeles
│   └── onboarding/         # Premier lancement
└── CLAUDE.md
```

## Fonctionnalites implementees

### Dictaphone push-to-talk
- Hold Ctrl+Space -> enregistre, release -> transcrit -> colle automatiquement
- STT local via Parakeet TDT v3 (~130ms pour une phrase)
- Auto-paste via VBScript (quasi instantane)
- Tray icon 3 etats (idle gris, recording rouge, busy orange)
- Sons feedback (beep start, double beep done, buzz error)

### Bubble avec actions IA
- Bubble oscilloscope animee pendant enregistrement
- 4 boutons apparaissent apres 500ms : Abc, Trad, Mail FR, Mail EN
- Premier clic verrouille le choix (message "OK — relacher Ctrl+Space")
- Si aucun bouton clique : transcription brute
- Si bouton clique : transcription -> Gemini -> paste

### Double Ctrl+C (overlay)
- Selectionner du texte, Ctrl+C Ctrl+C rapide (<400ms)
- Overlay dark centre avec 4 boutons : Abc, Trad, Mail FR, Mail EN
- Resultat affiche -> Copier ou Coller
- Escape pour fermer

### Actions Gemini

**Bubble (contexte dictee)** :
- Abc : corrige erreurs transcription
- Trad : traduit en anglais (pas de mise en forme)
- Mail FR : email professionnel FR avec signature auto
- Mail EN : email professionnel EN avec signature auto

**Overlay (contexte selection)** :
- Abc : corrige orthographe/grammaire
- Trad : traduit dans l'autre langue (auto-detect FR/EN)
- Mail FR : reformule en email FR
- Mail EN : reformule en email EN

### Configuration (tray menu)
- Selection microphone (liste tous les devices audio)
- Cle API Gemini (dialog dark, stockee chiffree via safeStorage)
- Auto-correction Gemini (checkbox toggle)
- Modeles STT (ouvre le model manager)

### Onboarding premier lancement
- 3 etapes : cle Gemini -> micro -> raccourcis
- S'affiche uniquement si pas de cle configuree

### Model manager
- Cards par modele avec barres precision/vitesse
- Download avec progress bar
- Badge actif/installe

## Regles de dev

- **Secrets** : Cle API Gemini via electron safeStorage, JAMAIS en clair
- **API Gemini** : Header `x-goog-api-key` (pas query string `?key=`)
- **Auto-paste** : VBScript sur Windows (cscript), xdotool sur Linux
- **Push-to-talk** : uiohook-napi (keydown/keyup), PAS globalShortcut (cause key repeat)
- **Focus** : Bubble non-focusable au show (showInactive). Overlay minimize avant insert pour refocus
- **Multi-ecran** : Toutes les fenetres s'ouvrent sur l'ecran du curseur (screen.getCursorScreenPoint)
- **Logs** : debug.log dans le dossier projet, logger.js synchrone
- **ELECTRON_RUN_AS_NODE** : Doit etre unset pour lancer (VS Code le set)

## Design system

```
--bg-primary: #0f172a
--bg-secondary: #1e293b
--bg-tertiary: #334155
--text-primary: #e2e8f0
--text-secondary: #94a3b8
--accent: #f97316
--accent-hover: #fb923c
--success: #22c55e
--error: #f87171
--info: #38bdf8
```

## Lancement dev

```bash
# Depuis un terminal (PAS VS Code a cause de ELECTRON_RUN_AS_NODE)
cd THE-LAST-WHISPER
npx electron .
```

## Modeles STT

| Modele | Usage | Taille | Source |
|--------|-------|--------|--------|
| Parakeet TDT v3 int8 | Rapide, francais excellent | ~464 MB | sherpa-onnx releases |
| Whisper Large v3 Turbo | Precis, segments longs | ~800 MB | sherpa-onnx releases |

Stockage : `%APPDATA%/the-last-whisper/models/` (Win) / `~/.local/share/the-last-whisper/models/` (Linux)
