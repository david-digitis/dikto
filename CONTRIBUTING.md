# Contributing to Dikto

Thanks for your interest in contributing!

## Quick start

```bash
git clone https://github.com/david-digitis/dikto.git
cd dikto
npm install
npx electron .
```

> Do NOT launch from VS Code terminal (it sets ELECTRON_RUN_AS_NODE).
> Use Windows Terminal, PowerShell, or a system terminal.

## Project structure

- `main.js` -- Main process (hotkeys, windows, IPC orchestration)
- `src/` -- Core modules (STT, recorder, gemini, config, paste, etc.)
- `ui/` -- Renderer HTML/CSS/JS (bubble, overlay, onboarding, etc.)
- `preload.js` -- IPC bridge (contextBridge)

## What we need help with

Check issues labeled `good first issue` or `help wanted`.

## Guidelines

- **No Python, no Docker, no heavy deps.** The app has 2 runtime deps. Keep it that way.
- **Test on real hardware.** STT timing matters -- test the full push-to-talk flow.
- **Privacy first.** Audio never leaves the machine. Only transcribed text goes to Gemini when explicitly requested.
- **Cross-platform.** If you change paste/hotkey logic, test on both Windows and Linux (or flag it clearly).

## Pull requests

1. Fork and create a branch from `main`
2. Make your changes
3. Test the full push-to-talk -> paste flow
4. Open a PR with a clear description of what and why

## Code style

- Plain JavaScript (no TypeScript, no transpiler)
- No frameworks in the renderer (vanilla HTML/CSS/JS)
- Keep it simple and readable

## Reporting bugs

Use the bug report template. Include your OS, app version, and debug.log contents.
