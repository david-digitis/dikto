# Rapport d'analyse - Developer Advocate

**Projet** : `c:/Users/David/JSCODE-PROJECT/THE-LAST-WHISPER`
**Date** : 2026-03-25
**Agent** : specialized-developer-advocate
**Objectif** : Strategie de lancement open source et maximisation de l'adoption communautaire

---

## Resume

The Last Whisper est un projet techniquement solide avec un positionnement unique : c'est le **seul dictaphone desktop open source qui combine STT 100% local, traduction integree, AI overlay systeme et clipboard manager dans un seul binaire**. Le repo a ete cree hier (2026-03-24) avec 0 stars et aucune optimisation GitHub (pas de topics, description courte, pas de community files). La fenetre de lancement est excellente : le marche des alternatives open source a Wispr Flow explose depuis 2025, mais aucun concurrent ne couvre Windows+Linux avec cette completude fonctionnelle.

---

## 1. Positionnement unique

### Elevator pitch (1 ligne)

> **Push-to-talk voice typing with 50ms local STT, built-in AI translation/rewriting, and a system-wide overlay -- all in one app, no cloud needed for dictation.**

Version alternative plus courte pour les conversations :
> **"It's like having Wispr Flow + DeepL + Ditto clipboard manager in a single open-source app."**

### Pourquoi c'est different

Aucun concurrent ne fait les 3 choses a la fois :

| Capacite | The Last Whisper | Freeflow | Amical | Tambourine Voice | Whishpy |
|----------|:---:|:---:|:---:|:---:|:---:|
| STT 100% local | OUI | OUI | OUI | OUI (cloud opt.) | NON (cloud) |
| Push-to-talk hotkey | OUI | OUI | OUI | OUI | OUI |
| Traduction integree | OUI | NON | NON | NON | NON |
| AI overlay sur texte existant | OUI | NON | NON | NON | NON |
| Clipboard manager | OUI | NON | NON | NON | NON |
| Custom AI prompts | OUI | NON | Partiel | Partiel | NON |
| Windows natif | OUI | NON (macOS) | OUI | OUI | NON (macOS) |
| Linux/Wayland | OUI | NON | NON | NON | NON |
| Dual STT engine | OUI | NON | NON | NON | NON |
| Taille binaire | 76-114 MB | ~50 MB | ~200 MB | ~100 MB | ~50 MB |
| Deps runtime | 2 | Varies | Beaucoup | Plusieurs | Python |

**Le differenciateur-cle : The Last Whisper n'est pas "juste un dictaphone". C'est un productivity layer vocal complet.**

### Categorie GitHub

Pas de categorie formelle sur GitHub, mais le positionnement SEO doit cibler : **Productivity > Voice Tools > Desktop App**

---

## 2. Analyse concurrentielle GitHub

### Concurrents directs (classe par stars)

#### Freeflow (1,055 stars) - zachlatta/freeflow
- **Cree** : Fevrier 2026 (tres recent, explosion rapide)
- **Stack** : Swift (macOS only)
- **Forces** : Hype "alternative a Wispr Flow", createur connu (fondateur Hack Club), community forte
- **Faiblesses** : macOS seulement, pas de traduction, pas d'overlay
- **Menace pour TLW** : Faible -- pas le meme OS

#### Amical (1,039 stars) - amicalhq/amical
- **Cree** : Mai 2025
- **Stack** : TypeScript, Electron + Next.js + Expo
- **Forces** : Feature-rich, meeting notes, MCP integration, Ollama support, bonne doc
- **Faiblesses** : Complexe (Next.js + Expo), pas de traduction integree, pas d'overlay systeme
- **Menace pour TLW** : Moderee -- meme stack Electron mais approche "AI note-taking" vs "voice productivity"

#### Tambourine Voice (320 stars) - kstonekuan/tambourine-voice
- **Cree** : Novembre 2025
- **Stack** : Rust + Tauri + TypeScript
- **Forces** : Cross-platform (macOS+Windows), Tauri = binaire leger, AGPL
- **Faiblesses** : AGPL (repoussant pour certains), pas de Linux, pas de traduction
- **Menace pour TLW** : Moderee -- meme cible Windows

#### Dial8 (183 stars) - liamadsr/dial8-open-source
- **Cree** : Juillet 2025
- **Stack** : Swift (macOS only)
- **Forces** : UX native macOS soignee
- **Faiblesses** : macOS only, license custom

#### Whishpy (89 stars) - prasanjit101/whishpy
- **Stack** : Python, macOS, cloud STT
- **Faiblesses** : Cloud-dependent, macOS only

### Carte du marche

```
                    Cloud STT                    Local STT
                  +------------------+-------------------+
    macOS only    | Whishpy (89*)    | Freeflow (1055*)  |
                  |                  | Dial8 (183*)      |
                  +------------------+-------------------+
    Windows       |                  | Tambourine (320*) |
                  |                  | Amical (1039*)    |
                  +------------------+-------------------+
    Linux         |                  |                   |
                  |                  |  << VIDE >>       |
                  +------------------+-------------------+
    Win + Linux   |                  | THE LAST WHISPER  |
    + AI overlay  |                  | + traduction      |
    + clipboard   |                  | + clipboard mgr   |
                  +------------------+-------------------+
```

**The Last Whisper occupe un carre vide.** C'est le seul a couvrir Windows + Linux + traduction + overlay + clipboard. C'est un positionnement defensible.

---

## 3. Strategie de lancement

### 3.1 Ou poster et avec quel angle

#### Tier 1 -- Fort potentiel viral

| Plateforme | Subreddit / Section | Angle | Timing |
|------------|-------------------|-------|--------|
| **Hacker News** | Show HN | "Show HN: The Last Whisper -- local voice typing with AI translation overlay (open source)" | Mardi ou mercredi, 9h-11h EST |
| **Reddit r/opensource** | Post | "I built an open-source voice productivity app -- local STT + AI translation + clipboard manager" | Lundi-mercredi matin |
| **Reddit r/linux** | Post | "Push-to-talk voice dictation that actually works on Wayland (Fedora + GNOME)" | Vendredi (vibe communautaire) |

#### Tier 2 -- Audiences ciblees

| Plateforme | Subreddit / Section | Angle |
|------------|-------------------|-------|
| **Reddit r/productivity** | "This replaced 3 apps for me: voice typing, DeepL, and clipboard manager" |
| **Reddit r/selfhosted** | "100% local voice-to-text, no cloud, no Docker, single binary" |
| **Reddit r/Fedora** | "Built a Wayland-native voice dictation app for Fedora" |
| **Reddit r/electronjs** | "Electron app with 2 runtime deps and 76MB builds -- it's possible" |
| **Reddit r/LanguageLearning** | "Free tool: dictate in one language, auto-translate to another" |

#### Tier 3 -- Amplification

| Plateforme | Action |
|------------|--------|
| **Product Hunt** | Lancer 2-3 semaines apres GitHub (avoir des stars d'abord) |
| **Lobste.rs** | Angle technique : "Dual STT engine architecture with Parakeet + Whisper" |
| **Dev.to** | Tutorial : "How I built a 50ms voice typing app with sherpa-onnx" |
| **Twitter/X** | Thread avec GIF/video demo |
| **Mastodon** | Crosspost Linux/FOSS angle |

### 3.2 Structure d'un post Hacker News optimal

```
Title: Show HN: The Last Whisper -- local voice typing + AI translation overlay (open source)

Body (premier commentaire du createur) :

Hi HN, I built this because I was tired of switching between three apps:
a voice dictation tool, DeepL, and a clipboard manager.

The Last Whisper is a push-to-talk dictaphone that runs entirely locally
(sherpa-onnx with Parakeet TDT v3 for ~50ms latency). It works system-wide:
hold Ctrl+Space in any app, speak, release -- your words appear at the cursor.

What makes it different from other Wispr Flow alternatives:

- Built-in smart translation (like having DeepL integrated -- select text,
  double Ctrl+C, it detects the language and translates)
- AI overlay on any selected text (correct, rewrite, translate without
  re-typing)
- Clipboard manager with search
- Custom AI prompts (summarize, make formal, etc.)
- Dual STT: Parakeet for speed, Whisper for accuracy (auto-switches)
- Works on Windows 11 AND Linux/Wayland (most alternatives are macOS-only)

Tech: Electron, sherpa-onnx-node, 2 runtime deps, 76MB portable binary.
AI features use Gemini Flash Lite (free tier) but dictation is 100% offline.

MIT licensed. Feedback welcome -- especially from Linux/Wayland users,
the ecosystem there is severely underserved.

[link to repo]
```

**Regles HN** :
- Ne pas mettre "open source" dans le titre (c'est implicite sur HN, ca fait marketing)
- Commencer par le probleme personnel, pas les features
- Mentionner la stack technique (HN adore ca)
- Terminer par un appel a feedback specifique, pas generique

### 3.3 Structure d'un post Reddit (r/opensource)

```
Title: I built an open-source voice productivity app -- local STT, AI
translation, clipboard manager in one tool [MIT]

Body:

After months of testing every voice-to-text tool I could find, I got
frustrated: Wispr Flow is macOS-only and paid. DeepL is a separate window.
Clipboard managers don't understand context. Nothing worked on Linux/Wayland.

So I built The Last Whisper:

**What it does:**
- Hold Ctrl+Space, speak, release -> text appears at your cursor (~50ms)
- Click "Trad" during dictation -> instant translation
- Select any text, double Ctrl+C -> AI overlay (translate, correct, rewrite)
- Clipboard history with search
- Custom prompts (summarize, make formal, etc.)

**Privacy:** Voice never leaves your machine. STT is 100% local
(Parakeet TDT v3 / Whisper Turbo via sherpa-onnx). AI features use
Gemini API only when you explicitly ask.

**Platform:** Windows 11 + Linux Fedora/Wayland. 76-114 MB binary.

MIT license: [repo link]

Would love feedback from the community.
```

### 3.4 Timing optimal

| Semaine | Action |
|---------|--------|
| **S0 (maintenant)** | Optimiser le repo GitHub (topics, description, badges, issue templates, CONTRIBUTING) |
| **S0 + 2 jours** | Reddit r/opensource + r/linux |
| **S0 + 4 jours** | Hacker News (Show HN) -- mardi ou mercredi matin EST |
| **S1** | Reddit r/productivity, r/selfhosted |
| **S2** | Dev.to article technique, Twitter thread |
| **S3** | Product Hunt (quand les stars > 50-100) |
| **S4+** | Conference CFP submissions si traction |

**Ne PAS tout poster le meme jour.** Espacer de 2-3 jours minimum pour pouvoir repondre aux commentaires de chaque plateforme. Un createur qui repond a chaque commentaire dans les 2h = +300% d'engagement.

---

## 4. GitHub SEO

### 4.1 Description du repo (actuelle vs recommandee)

**Actuelle** (problematique) :
```
Dictaphone push-to-talk + assistant IA desktop -- STT local + Gemini
```

**Recommandee** (350 chars max, en anglais pour audience mondiale) :
```
Push-to-talk voice typing with ~50ms local STT (Parakeet/Whisper via sherpa-onnx). Built-in AI translation, grammar correction, email rewriting. System-wide overlay: select any text, double Ctrl+C to translate/rewrite. Clipboard manager included. Windows + Linux/Wayland. MIT.
```

Cette description contient tous les mots-cles qu'un developpeur chercherait : voice typing, local STT, Parakeet, Whisper, sherpa-onnx, translation, clipboard, Windows, Linux, Wayland, MIT.

### 4.2 Topics recommandes

```
speech-to-text
voice-typing
dictation
push-to-talk
local-ai
sherpa-onnx
whisper
parakeet
electron
translation
clipboard-manager
productivity
privacy-first
wayland
linux
windows
gemini
open-source
offline
desktop-app
```

**Limite GitHub : 20 topics max.** Ceux ci-dessus font exactement 20. Prioriser les 20 ci-dessus dans cet ordre.

### 4.3 Badges pour le README

Ajouter en haut du README, juste apres le titre :

```markdown
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows%2011-blue.svg)]()
[![Linux](https://img.shields.io/badge/platform-Linux%20Wayland-orange.svg)]()
[![Electron](https://img.shields.io/badge/Electron-33-47848F.svg?logo=electron)]()
[![GitHub release](https://img.shields.io/github/v/release/david-digitis/the-last-whisper)](https://github.com/david-digitis/the-last-whisper/releases)
[![GitHub stars](https://img.shields.io/github/stars/david-digitis/the-last-whisper?style=social)](https://github.com/david-digitis/the-last-whisper)
```

### 4.4 Autres optimisations repo

| Element | Etat actuel | Action |
|---------|-------------|--------|
| Description | Trop courte, en francais | Remplacer par la version anglaise ci-dessus |
| Topics | Aucun | Ajouter les 20 topics ci-dessus |
| Website URL | Absent | Ajouter l'URL du repo ou une page GitHub Pages |
| Social preview | Absent | Creer une image 1280x640 avec logo + tagline |
| Releases | v0.2.0 | Mettre a jour vers v0.3.0 avec changelog propre |
| .github directory | Absent | Creer (voir section 5) |

---

## 5. Community building

### 5.1 Faut-il un Discord/Matrix ?

**Pas maintenant.** Un serveur Discord vide fait pire qu'aucun serveur. La regle :

- **0-50 stars** : GitHub Issues + Discussions uniquement
- **50-500 stars** : Activer GitHub Discussions (pas besoin d'un serveur tiers)
- **500+ stars** : Envisager un Discord/Matrix si les Discussions debordent

Activer **GitHub Discussions** sur le repo des maintenant. Categories : General, Feature Requests, Show & Tell, Q&A.

### 5.2 Issue templates

Creer `.github/ISSUE_TEMPLATE/` avec ces fichiers :

#### bug_report.yml
```yaml
name: Bug Report
description: Something doesn't work as expected
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to report this bug.
  - type: dropdown
    id: os
    attributes:
      label: Operating System
      options:
        - Windows 11
        - Linux (Fedora/Wayland)
        - Linux (other distro)
        - Other
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: App Version
      description: Check in tray menu or package.json
      placeholder: "0.3.0"
    validations:
      required: true
  - type: dropdown
    id: install-type
    attributes:
      label: Installation type
      options:
        - Portable (.exe)
        - Installer (NSIS)
        - AppImage
        - From source (npm)
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: Describe the bug clearly. Include steps to reproduce.
      placeholder: |
        1. I pressed Ctrl+Space
        2. I spoke for ~5 seconds
        3. On release, nothing was pasted
        Expected: text should appear at cursor
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs (if available)
      description: |
        Check debug.log in:
        - Windows: %APPDATA%/the-last-whisper/debug.log
        - Linux: ~/.config/the-last-whisper/debug.log
      render: shell
```

#### feature_request.yml
```yaml
name: Feature Request
description: Suggest a new feature or improvement
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: Describe the use case, not just the feature
      placeholder: "I frequently need to... but currently I have to..."
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How should it work? Be specific.
    validations:
      required: true
  - type: dropdown
    id: scope
    attributes:
      label: Which area?
      options:
        - Dictation / STT
        - Translation
        - AI overlay (double Ctrl+C)
        - Clipboard manager
        - Custom modes
        - UI / UX
        - Linux support
        - Other
```

### 5.3 CONTRIBUTING.md

```markdown
# Contributing to The Last Whisper

Thanks for your interest in contributing!

## Quick start

git clone https://github.com/david-digitis/the-last-whisper.git
cd the-last-whisper
npm install
npx electron .

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

- **No Python, no Docker, no heavy deps.** The app has 2 runtime deps.
  Keep it that way.
- **Test on real hardware.** STT timing matters -- test push-to-talk flow.
- **Privacy first.** Audio never leaves the machine. Only transcribed text
  goes to Gemini when explicitly requested.
- **Cross-platform.** If you change paste/hotkey logic, test on both
  Windows and Linux (or flag it clearly).

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

Use the bug report template. Include your OS, app version, and
debug.log contents.
```

### 5.4 Good first issues a creer

Ces issues attirent des contributeurs tout en ajoutant de la valeur reelle :

| # | Titre | Label | Pourquoi c'est bon |
|---|-------|-------|-------------------|
| 1 | **Add keyboard shortcut to open clipboard history** | `good first issue`, `enhancement` | Simple IPC + globalShortcut, auto-contenu |
| 2 | **Show STT model name in tray tooltip** | `good first issue`, `enhancement` | 3 lignes de code, decouvre le tray module |
| 3 | **Add "Copy raw text" button in overlay** | `good first issue`, `ui` | HTML + IPC, pas de backend |
| 4 | **Support dark/light system theme detection** | `good first issue`, `ui` | `nativeTheme.shouldUseDarkColors`, educatif |
| 5 | **Add Spanish to default language list** | `good first issue`, `i18n` | Config array + UI, trivial |
| 6 | **Create .desktop file for Linux auto-start** | `good first issue`, `linux` | Fichier texte, pas de code Electron |
| 7 | **Add recording duration display in bubble** | `good first issue`, `ui` | Timer JS dans la bubble, auto-contenu |
| 8 | **Improve error message when no STT model is downloaded** | `good first issue`, `dx` | UX improvement, beginner friendly |
| 9 | **Add Ctrl+Z to undo last paste** | `help wanted`, `enhancement` | Plus complexe, attire les contributeurs serieux |
| 10 | **Ubuntu/Debian support (.deb package)** | `help wanted`, `linux` | electron-builder config, attire les Linux users |

---

## 6. Risques pour l'adoption

### Critiques

| # | Risque | Impact | Mitigation |
|---|--------|--------|------------|
| 1 | **"C'est du Electron"** -- reaction allergique previsible sur HN et r/linux | Fort -- certains refuseront meme d'essayer | Adresser proactivement : "76 MB binary, 2 runtime deps, ~50ms STT. The Electron tax here is a 76MB download, not a sluggish app." Avoir des benchmarks prets. |
| 2 | **Dependance a Gemini pour les features IA** -- "et si Google coupe le free tier ?" | Moyen | Documenter que la dictation marche 100% sans Gemini. Prevoir un issue "Support Ollama/local LLM as alternative to Gemini" pour montrer l'intention. |
| 3 | **Taille des modeles STT : 464-538 MB par modele** | Moyen -- premier lancement penible sur connexion lente | Afficher la progression clairement. Documenter les tailles dans le README. Envisager un modele plus leger (tiny) pour le onboarding. |
| 4 | **Pas de macOS** | Fort -- 60%+ des devs HN sont sur Mac | Etre transparent : "Windows + Linux first. macOS contributions welcome." Ne pas promettre de roadmap Mac sans plan concret. |

### Importants

| # | Risque | Impact | Mitigation |
|---|--------|--------|------------|
| 5 | **README en partie francophone** (CLAUDE.md, docs internes) | Moyen -- barriere pour contributeurs non-FR | Le README principal est deja en anglais (bien). S'assurer que toute la doc publique est en anglais. |
| 6 | **`private: true` dans package.json** | Faible mais symbolique | Retirer le flag `private` -- ca n'a pas d'impact fonctionnel mais ca envoie un mauvais signal pour un projet open source |
| 7 | **Pas de CI/CD** (pas de GitHub Actions) | Moyen | Les contributeurs ne peuvent pas verifier si leur PR casse quelque chose. Ajouter au minimum un workflow de build. |
| 8 | **`asar: false` dans electron-builder** | Faible -- securite et taille | Pas bloquant pour le lancement mais a documenter dans un issue "Investigate asar packaging" |

### Informationnels

| # | Risque | Impact | Mitigation |
|---|--------|--------|------------|
| 9 | **Nom "The Last Whisper"** -- poetique mais pas descriptif | Faible -- le nom est memorable, ca compense | Compenser avec une description repo tres explicite (fait ci-dessus) |
| 10 | **Pas de video/GIF demo** | Fort pour la conversion | Un GIF de 15 secondes montrant Ctrl+Space -> parle -> texte apparait vaut 1000 mots de README. **Priorite haute.** |

---

## 7. Plan d'action prioritise

### Immediate (avant le premier post public)

1. **Creer un GIF/video demo de 15-30 secondes** montrant le flow complet push-to-talk -> paste. C'est le single most impactful thing pour la conversion. Outils : OBS + gifski, ou ScreenToGif sur Windows.

2. **Mettre a jour le repo GitHub** :
   - Description anglaise optimisee (section 4.1)
   - 20 topics (section 4.2)
   - Badges dans le README (section 4.3)
   - Social preview image (1280x640)

3. **Creer le dossier `.github/`** :
   - `ISSUE_TEMPLATE/bug_report.yml`
   - `ISSUE_TEMPLATE/feature_request.yml`
   - `CONTRIBUTING.md`

4. **Retirer `"private": true`** de package.json

5. **Creer la release v0.3.0** avec un changelog structure

6. **Activer GitHub Discussions** sur le repo

### Court terme (semaine 1-2)

7. **Poster sur Reddit** r/opensource et r/linux (textes fournis en section 3.3)
8. **Poster sur Hacker News** (Show HN, texte en section 3.2)
9. **Creer les 10 "good first issues"** (section 5.4) -- les creer APRES les premiers posts, pas avant, pour que les visiteurs arrivent sur un repo qui a de l'activite
10. **Repondre a CHAQUE commentaire** dans les 2h sur chaque plateforme -- c'est non-negociable pour le lancement

### Moyen terme (semaine 3-6)

11. **Ecrire un article technique** sur Dev.to : "Building a 50ms voice typing app with sherpa-onnx and Electron"
12. **Lancer sur Product Hunt** (quand > 50 stars)
13. **Creer un issue "Ollama/local LLM support"** pour rassurer sur la dependance Gemini
14. **Ajouter un GitHub Actions workflow** basique (build Windows + Linux)
15. **Social preview image** si pas fait avant

### Long terme (mois 2+)

16. **Envisager macOS** si la demande communautaire est la
17. **Ambassador program** si > 500 stars et contributeurs reguliers
18. **Conference CFP** (FOSDEM, Linux App Summit) si traction suffisante

---

## 8. Checklist de fichiers a creer/modifier

| Fichier | Action | Priorite |
|---------|--------|----------|
| `package.json` | Retirer `"private": true` | Immediate |
| `README.md` | Ajouter badges en haut, GIF demo | Immediate |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Creer (contenu en section 5.2) | Immediate |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Creer (contenu en section 5.2) | Immediate |
| `CONTRIBUTING.md` | Creer (contenu en section 5.3) | Immediate |
| GitHub repo settings | Description, topics, social preview | Immediate |
| GitHub Discussions | Activer | Immediate |
| `.github/workflows/build.yml` | CI basique | Court terme |

---

## Notes pour l'agent correcteur

Ce rapport est un guide strategique, pas un rapport de bugs. Les actions a implementer sont :

1. **Ne pas modifier le code source** sauf `package.json` (retirer `private: true`)
2. **Creer les fichiers communautaires** : `.github/ISSUE_TEMPLATE/*.yml`, `CONTRIBUTING.md`
3. **Modifier le README** : ajouter les badges en haut (entre le titre et la premiere phrase)
4. **Les modifications GitHub repo settings** (description, topics, discussions) doivent etre faites via l'interface web GitHub ou via `gh` CLI, pas dans le code

Les textes de posts Reddit/HN fournis dans ce rapport sont des templates -- David devra les adapter a sa voix. L'authenticite du createur est le facteur #1 de succes sur ces plateformes.

**Point critique** : Le GIF/video demo est la priorite absolue. Sans ca, le taux de clic -> star sera dramatiquement plus bas. Un README sans demo visuelle en 2026, c'est comme un restaurant sans photo du plat.
