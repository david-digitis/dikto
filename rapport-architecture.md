# Rapport d'architecture - Multi-Provider LLM pour Dikto

**Projet** : `c:\Users\David\JSCODE-PROJECT\DIKTO`
**Date** : 2026-03-26
**Agent** : Backend Architect

---

## Resume

Dikto est une app Electron bien structuree avec un couplage fort a Gemini dans `src/gemini.js`. Le refactoring vers une architecture multi-provider est faisable en ~2-3 jours de travail. Le code actuel est propre : les prompts sont centralises, la config gere deja le chiffrement des cles API, et le pattern IPC est solide. L'effort principal porte sur l'abstraction du provider, l'integration Ollama, et l'adaptation UX dans le tray menu.

---

## 1. Pattern d'abstraction AI Provider

### Architecture recommandee : Strategy Pattern + Factory

Le code actuel dans `src/gemini.js` melange trois responsabilites :
- Construction des prompts (lignes 12-47)
- Appel HTTP a Gemini (lignes 52-87)
- Orchestration des actions (lignes 89-113)

**Structure cible :**

```
src/
├── ai/
│   ├── ai-provider.js        # Interface commune (classe abstraite)
│   ├── gemini-provider.js     # Implementation Gemini (extract de gemini.js)
│   ├── ollama-provider.js     # Implementation Ollama
│   ├── provider-factory.js    # Factory qui instancie le bon provider
│   └── prompt-builder.js      # Construction des prompts (extract de gemini.js)
├── gemini.js                  # DEPRECE -> re-exporte depuis ai/ pour compatibilite
```

### Interface commune (`ai-provider.js`)

```javascript
class AIProvider {
  constructor(config) {
    this.config = config;
  }

  // Nom affiche dans l'UI
  get name() { throw new Error('Not implemented'); }

  // Le provider est-il pret a recevoir des requetes ?
  async isAvailable() { throw new Error('Not implemented'); }

  // Appel LLM generique — le seul point d'entree
  async complete(prompt, options = {}) { throw new Error('Not implemented'); }
}
```

**Pourquoi une seule methode `complete()` et pas une par action :**
Les actions (traduction, correction, email) sont gerees par les prompts, pas par le provider. Le provider ne fait que `prompt -> texte`. C'est `prompt-builder.js` qui construit le bon prompt selon l'action. Ca evite de dupliquer la logique d'action dans chaque provider.

### Factory (`provider-factory.js`)

```javascript
const { getConfig } = require('../config');

function createProvider() {
  const config = getConfig();
  const providerType = config.aiProvider || 'gemini';

  switch (providerType) {
    case 'gemini':
      const GeminiProvider = require('./gemini-provider');
      return new GeminiProvider(config);
    case 'ollama':
      const OllamaProvider = require('./ollama-provider');
      return new OllamaProvider(config);
    default:
      throw new Error(`Unknown AI provider: ${providerType}`);
  }
}

// Singleton avec invalidation quand la config change
let _provider = null;
let _providerType = null;

function getProvider() {
  const config = getConfig();
  const type = config.aiProvider || 'gemini';

  if (!_provider || _providerType !== type) {
    _provider = createProvider();
    _providerType = type;
  }
  return _provider;
}

function resetProvider() {
  _provider = null;
  _providerType = null;
}

module.exports = { getProvider, resetProvider };
```

### Gestion des differences de prompting entre modeles

Les modeles 7B (Qwen, Phi, Gemma) sont moins bons que Gemini pour suivre des instructions complexes. Deux strategies :

**Option A (recommandee) : Prompts identiques, tolerance aux imperfections.**
Les modeles 7B recents (Qwen 2.5 7B, Phi-4-mini) suivent bien les instructions simples. Les prompts actuels de Dikto sont deja concis et directs ("Corrige les fautes... Renvoie UNIQUEMENT le texte corrige"). Ca devrait marcher tel quel pour 80% des cas.

**Option B (si necessaire) : Variantes de prompts par tier.**

```javascript
// Dans prompt-builder.js
function buildPrompt(action, text, context, providerTier) {
  if (providerTier === 'local' && action.simplifiedPrompt) {
    return `${action.simplifiedPrompt}\n\n${text}`;
  }
  return action.buildPrompt(text, context);
}
```

**Ma recommandation** : partir sur l'option A. Ne complexifier que si les tests montrent des problemes reels avec un modele specifique. Pas de sur-ingenierie.

### Adaptation du format de requete

La seule vraie difference entre providers est le format d'appel :

| Aspect | Gemini | Ollama |
|--------|--------|--------|
| Auth | Header `x-goog-api-key` | Aucune (localhost) |
| Endpoint | `generativelanguage.googleapis.com` | `localhost:11434` |
| Format requete | `contents[].parts[].text` | `messages[].content` (OpenAI-compat) |
| Format reponse | `candidates[0].content.parts[0].text` | `message.content` |
| System prompt | Via `systemInstruction` | Via `role: "system"` dans messages |

Chaque provider encapsule son format. Le reste du code ne voit que `complete(prompt) -> string`.

---

## 2. Ollama comme provider

### API REST d'Ollama

Ollama expose une API HTTP sur `http://localhost:11434` par defaut.

**Endpoints utiles :**

| Endpoint | Methode | Usage |
|----------|---------|-------|
| `/api/chat` | POST | Completion avec messages (format OpenAI) |
| `/api/generate` | POST | Completion raw (prompt simple) |
| `/api/tags` | GET | Lister les modeles installes |
| `/api/show` | POST | Info sur un modele specifique |
| `/api/pull` | POST | Telecharger un modele |
| `/` | GET | Health check |

**Requete `/api/chat` (recommandee) :**

```javascript
const response = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen2.5:7b',
    messages: [
      { role: 'user', content: prompt }
    ],
    stream: false,
    options: {
      temperature: 0.3,
      num_predict: 2048,
    }
  })
});

const data = await response.json();
const text = data.message.content;
```

**Pourquoi `/api/chat` plutot que `/api/generate` :**
- Format messages compatible OpenAI (futur provider OpenAI gratuit)
- Support natif du system prompt via `role: "system"`
- C'est l'endpoint recommande par Ollama depuis v0.3+

### Streaming vs non-streaming

**Recommendation : non-streaming (`stream: false`).**

Raisons :
- Les textes traites par Dikto sont courts (une phrase a quelques paragraphes)
- Le temps de generation pour ~200 tokens sur un 7B est de 1-3 secondes -- pas besoin de streaming
- Non-streaming simplifie enormement le code (un seul `await fetch`)
- L'UI montre deja un indicateur "Processing..." pendant le traitement
- Le streaming ajouterait de la complexite (SSE parsing, buffer, cancel) pour un gain UX negligeable

Si besoin futur (modeles plus lents, textes plus longs), le streaming peut s'ajouter sans casser l'interface `complete()` -- il suffit de retourner un `AsyncGenerator` en option.

### Detection d'Ollama

```javascript
async isAvailable() {
  try {
    const response = await fetch('http://localhost:11434/', {
      signal: AbortSignal.timeout(2000) // 2s timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

### Lister les modeles disponibles

```javascript
async listModels() {
  const response = await fetch('http://localhost:11434/api/tags');
  const data = await response.json();
  return data.models.map(m => ({
    name: m.name,          // "qwen2.5:7b"
    size: m.size,          // bytes
    modified: m.modified_at,
    family: m.details?.family,
    parameterSize: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
  }));
}
```

### Gestion des erreurs

Trois cas a gerer dans le provider Ollama :

```javascript
async complete(prompt, options = {}) {
  // 1. Ollama pas lance
  let response;
  try {
    response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.3, num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error('Ollama timeout (30s) — le modele est peut-etre trop lent');
    }
    throw new Error('Ollama non disponible. Verifier qu\'Ollama est lance (ollama serve).');
  }

  // 2. Modele pas telecharge
  if (response.status === 404) {
    throw new Error(`Modele "${this.model}" non trouve dans Ollama. Lancer : ollama pull ${this.model}`);
  }

  // 3. Autre erreur
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama erreur ${response.status}: ${body.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.message?.content;
  if (!text) throw new Error('Ollama a retourne une reponse vide');
  return text.trim();
}
```

---

## 3. Alternative : llama.cpp embarque (node-llama-cpp)

### Faisabilite technique

**node-llama-cpp** est un binding Node.js pour llama.cpp. Il permet d'executer un modele GGUF directement dans le process Node.js d'Electron, sans serveur externe.

### Avantages

- Zero dependance externe (pas besoin d'installer Ollama)
- Distribution tout-en-un (Electron + moteur LLM)
- Controle total sur le cycle de vie du modele
- Pas de port reseau expose (securite)

### Inconvenients

| Probleme | Impact | Severite |
|----------|--------|----------|
| Taille binaire | +50-100 MB pour le runtime llama.cpp (sans modele) | Moyen |
| Compilation native | Necessite `node-gyp` ou prebuilds par plateforme + architecture | Critique |
| Compatibilite Electron | Rebuild natif pour la version d'Electron utilisee | Important |
| Modeles GGUF | Les modeles sont au format GGUF (differents d'Ollama), ~4-5 GB pour un 7B Q4 | Moyen |
| Maintenance | Chaque mise a jour Electron necessite un rebuild de node-llama-cpp | Important |
| Deja uiohook-napi | Dikto a deja un module natif problematique, en ajouter un second multiplie les risques de build | Important |

### Verdict : NON RECOMMANDE pour Dikto

Le jeu n'en vaut pas la chandelle. Dikto a deja un module natif (`uiohook-napi`) qui cause des complications de build. Ajouter `node-llama-cpp` doublerait cette charge de maintenance. Ollama est un runtime leger (90 MB), installe en un clic, et resout exactement le meme probleme sans les inconvenients.

Le seul scenario ou ca vaudrait le coup : si Dikto etait distribue comme une appliance tout-en-un avec zero installation. Ce n'est pas le cas (l'utilisateur installe deja l'app + telecharge des modeles STT).

---

## 4. UX dans les Settings

### Organisation du tray menu

Le menu tray actuel dans `src/tray.js` a une section "Post-processing" (ligne 195). C'est la qu'il faut ajouter le choix du provider.

**Proposition :**

```
Post-processing
  ├── AI provider: Gemini          [sous-menu radio]
  │     ├── (*) Gemini (cloud)
  │     └── ( ) Ollama (local)     [grise si indisponible]
  ├── Ollama model: qwen2.5:7b    [sous-menu, visible si Ollama selectionne]
  │     ├── qwen2.5:7b
  │     ├── phi4-mini
  │     └── (aucun modele)
  ├── Ollama status: Connected     [label informatif]
  ├── Action modes...
  ├── Gemini auto-correction
  ├── Native language: French
  └── Target language: English
```

**Regles d'affichage :**
- Si provider = "gemini" : afficher la cle API comme aujourd'hui, masquer les options Ollama
- Si provider = "ollama" : afficher le modele selectionne et le statut de connexion
- Le label du provider dans le menu affiche un indicateur visuel : `Gemini (cloud)` / `Ollama (local)`
- Si Ollama n'est pas detecte : l'option reste selectionnable mais affiche un avertissement

### Detection automatique d'Ollama au demarrage

Au lancement de Dikto, un health check silencieux sur `localhost:11434` :

```javascript
// Dans main.js, apres initTray()
async function checkOllamaStatus() {
  try {
    const res = await fetch('http://localhost:11434/', {
      signal: AbortSignal.timeout(2000)
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- Si Ollama est detecte et le provider est configure sur "ollama" : tout va bien
- Si Ollama n'est pas detecte et le provider est "ollama" : afficher un warning dans le tray
- Ce check se fait aussi avant chaque requete LLM (dans `isAvailable()`)

### Download de modele depuis Dikto

**Pas recommande en v1.** Raisons :
- Les modeles LLM font 4-8 GB (vs ~500 MB pour les modeles STT)
- Ollama gere deja le telechargement (`ollama pull qwen2.5:7b`) avec un excellent UX (barre de progression, resume, verification)
- Dupliquer cette fonctionnalite dans Dikto serait beaucoup de travail pour un resultat inferieur
- L'utilisateur qui installe Ollama est deja a l'aise avec un terminal

**Alternative pragmatique** : un bouton dans le menu tray "Open Ollama..." qui ouvre la page de telechargement ou execute `ollama pull` dans un terminal.

En v2, si la demande existe, on pourrait ajouter un helper qui execute `ollama pull <model>` en background et affiche la progression.

### Fallback automatique vers Gemini

**Oui, mais configurable.** Si Ollama ne repond pas :

```javascript
async function completeWithFallback(prompt, options) {
  const config = getConfig();
  const provider = getProvider();

  try {
    return await provider.complete(prompt, options);
  } catch (err) {
    if (config.aiProvider === 'ollama' && config.aiFallback !== false && config.geminiApiKey) {
      log(`[AI] Ollama failed (${err.message}), falling back to Gemini`);
      const GeminiProvider = require('./ai/gemini-provider');
      const fallback = new GeminiProvider(config);
      return await fallback.complete(prompt, options);
    }
    throw err;
  }
}
```

Config :
- `config.aiProvider` : `"gemini"` ou `"ollama"`
- `config.aiFallback` : `true` (defaut) ou `false`
- Le fallback ne s'active que si la cle Gemini est configuree

---

## 5. Adaptation des prompts

### Les prompts actuels fonctionnent-ils avec des modeles 7B ?

**Analyse des prompts existants dans `config.js` :**

| Prompt | Complexite | Compatible 7B ? | Risques |
|--------|-----------|-----------------|---------|
| Grammaire (Abc) | Simple : corriger sans reformuler | Oui | Tres peu -- c'est le cas d'usage ideal |
| Traduction | Moyenne : detecter langue + traduire | Oui avec reserves | Un 7B peut melanger les langues sur des textes courts |
| Mail FR | Moyenne : detecter ton + generer email | Oui | Le format peut varier (signature, ton) |
| Mail EN | Moyenne : detecter ton + generer email | Oui | Idem |
| Auto-correction | Simple | Oui | -- |

**Verdict : les prompts actuels devraient fonctionner sans modification pour la correction et la traduction simple.** Les modeles 7B recents (Qwen 2.5, Phi-4-mini, Gemma 3) suivent bien les instructions "renvoie UNIQUEMENT X".

Les risques sont mineurs :
- Parfois un modele 7B ajoute un preambule ("Voici la correction :") malgre l'instruction contraire
- La detection de ton (tutoiement/vouvoiement) peut etre moins fiable
- La traduction de phrases tres courtes (1-2 mots) peut poser probleme

### Nettoyage post-generation

Un simple post-processing peut gerer les cas ou le modele ajoute un preambule :

```javascript
function cleanResponse(text) {
  // Enlever les prefixes courants des modeles locaux
  const prefixes = [
    /^(voici|here is|here's)\s+(la |le |the )?(traduction|correction|translation|email)\s*[:\.]\s*/i,
    /^(corrig[eé]|translat(ed|ion)|email)\s*[:\.]\s*/i,
  ];
  let cleaned = text;
  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '');
  }
  return cleaned.trim();
}
```

### System prompt vs user prompt

| Provider | System prompt | User prompt |
|----------|---------------|-------------|
| Gemini | Pas de system prompt distinct (tout dans `contents`) | Le prompt complet est dans le user message |
| Ollama | Supporte `role: "system"` dans messages | Texte utilisateur separe |

Pour Ollama, on pourrait separer instruction et contenu :

```javascript
// Dans ollama-provider.js
async complete(prompt, options = {}) {
  const messages = [];

  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: options.userContent });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  // ... fetch
}
```

**Mais pour Dikto, c'est premature.** Les prompts sont courts et auto-contenus. Un seul message `user` contenant l'instruction + le texte fonctionne tres bien avec Ollama. Le split system/user peut se faire plus tard si les tests montrent un benefice.

### Modeles recommandes

Pour les cas d'usage de Dikto (correction, traduction FR/EN, redaction email) :

| Modele | Taille | RAM | Qualite Dikto | Vitesse (CPU) |
|--------|--------|-----|---------------|---------------|
| **Qwen 2.5 7B Q4** | 4.7 GB | ~6 GB | Excellent | ~15 tok/s |
| **Phi-4-mini Q4** | 2.5 GB | ~4 GB | Tres bon | ~25 tok/s |
| **Gemma 3 4B Q4** | 3.3 GB | ~5 GB | Bon | ~20 tok/s |
| Mistral 7B Q4 | 4.1 GB | ~6 GB | Bon | ~15 tok/s |
| Llama 3.2 3B Q4 | 2.0 GB | ~3 GB | Correct | ~30 tok/s |

**Recommendation : Qwen 2.5 7B** comme modele par defaut, **Phi-4-mini** pour les machines avec 8 GB RAM.

Raisons :
- Qwen 2.5 est le meilleur pour les instructions en francais parmi les 7B
- Phi-4-mini est remarquablement bon pour sa taille (3.8B parametres)
- Les deux gèrent bien la traduction FR/EN

---

## 6. Plan d'implementation concret

### Fichiers a modifier

| Fichier | Action | Complexite |
|---------|--------|------------|
| `src/ai/ai-provider.js` | **Creer** -- classe abstraite | Faible |
| `src/ai/gemini-provider.js` | **Creer** -- extract de `src/gemini.js` lignes 52-87 | Faible |
| `src/ai/ollama-provider.js` | **Creer** -- nouveau provider | Moyenne |
| `src/ai/provider-factory.js` | **Creer** -- factory + singleton | Faible |
| `src/ai/prompt-builder.js` | **Creer** -- extract de `src/gemini.js` lignes 12-47 | Faible |
| `src/gemini.js` | **Modifier** -- re-router vers `ai/` (facade de compatibilite) | Faible |
| `src/config.js` | **Modifier** -- ajouter `aiProvider`, `ollamaModel`, `ollamaUrl`, `aiFallback` | Faible |
| `src/tray.js` | **Modifier** -- ajouter sous-menu provider + modeles Ollama | Moyenne |
| `main.js` | **Modifier** -- health check Ollama, IPC pour lister modeles | Moyenne |
| `preload.js` | **Modifier** -- ajouter IPC pour modeles Ollama, check status | Faible |
| `ui/overlay/overlay.js` | **Modifier** -- remplacer "Gemini..." par le nom du provider | Trivial |
| `ui/bubble/bubble.js` | **Modifier** -- idem | Trivial |

### Etapes de developpement (ordonnees)

**Phase 1 : Abstraction (jour 1)**

1. Creer `src/ai/ai-provider.js` avec la classe abstraite
2. Creer `src/ai/gemini-provider.js` en extrayant la logique de `src/gemini.js`
3. Creer `src/ai/prompt-builder.js` en extrayant la construction des prompts
4. Creer `src/ai/provider-factory.js`
5. Modifier `src/gemini.js` pour devenir une facade qui delegue a `provider-factory.js`
6. **Tester** : tout doit fonctionner exactement comme avant (regression zero)

**Phase 2 : Provider Ollama (jour 1-2)**

7. Creer `src/ai/ollama-provider.js` avec `complete()`, `isAvailable()`, `listModels()`
8. Ajouter `aiProvider`, `ollamaModel`, `ollamaUrl` dans `src/config.js`
9. Tester avec Ollama installe localement + `qwen2.5:7b`
10. Valider les 4 cas d'usage : grammaire, traduction, mail FR, mail EN

**Phase 3 : UX tray menu (jour 2)**

11. Ajouter le sous-menu "AI provider" dans `src/tray.js`
12. Ajouter la liste des modeles Ollama (via IPC)
13. Ajouter le health check Ollama au demarrage dans `main.js`
14. Ajouter les IPC handlers dans `main.js` et `preload.js`
15. Modifier les labels UI ("Gemini..." -> nom du provider actif)

**Phase 4 : Fallback + polish (jour 2-3)**

16. Implementer le fallback Ollama -> Gemini
17. Gestion des erreurs avec messages clairs pour l'utilisateur
18. Post-processing pour nettoyer les reponses des modeles locaux (si necessaire)
19. Tests edge cases : Ollama pas lance, modele pas telecharge, timeout, switch provider a chaud

### Estimation globale

| Phase | Effort | Risque |
|-------|--------|--------|
| Phase 1 : Abstraction | 3-4h | Faible (refactoring pur, regression testable) |
| Phase 2 : Provider Ollama | 3-4h | Moyen (integration externe, variabilite des reponses) |
| Phase 3 : UX tray | 3-4h | Faible (patterns deja en place dans tray.js) |
| Phase 4 : Fallback + polish | 2-3h | Faible |
| **Total** | **12-15h** | -- |

---

## Findings

### Critiques

Aucun finding critique. L'architecture actuelle est saine pour son scope.

### Importants

| # | Fichier | Ligne | Probleme | Remediation |
|---|---------|-------|----------|-------------|
| 1 | `src/gemini.js` | 52-87 | Couplage direct Gemini : `callGemini()` est appelee en dur depuis `main.js` (lignes 395-399). Impossible d'utiliser un autre provider sans modifier `main.js`. | Extraire dans un module `ai/` avec factory pattern. `main.js` appelle `getProvider().complete(prompt)` au lieu de `callGemini(prompt)`. |
| 2 | `src/tray.js` | 311-358 | La dialog API key (`showApiKeyDialog`) utilise `nodeIntegration: true` et `contextIsolation: false` -- c'est la seule fenetre du projet avec cette faiblesse de securite. | Migrer vers le pattern `preload.js` + `contextBridge` utilise par toutes les autres fenetres. |
| 3 | `src/gemini.js` | 4-5 | Le modele Gemini est hard-code (`gemini-2.5-flash-lite`). Devrait etre configurable car Google change regulierement les noms de modeles. | Ajouter `config.geminiModel` avec valeur par defaut. |

### Moyens

| # | Fichier | Ligne | Probleme | Remediation |
|---|---------|-------|----------|-------------|
| 1 | `main.js` | 395-399 | Les imports `require('./src/gemini')` sont faits inline dans les fonctions au lieu d'etre en haut du fichier. Ca fonctionne mais rend les dependances moins visibles. | Centraliser les imports en haut de `main.js` ou mieux, passer par le module `ai/`. |
| 2 | `ui/overlay/overlay.js` | 37 | Le texte "Gemini..." est hard-code dans l'UI. Devrait afficher le nom du provider actif. | Exposer le nom du provider via IPC et l'utiliser dans l'UI. |
| 3 | `ui/bubble/bubble.js` | 113 | Idem : "Transcription + Gemini..." hard-code. | Idem. |
| 4 | `src/config.js` | 5-40 | Les valeurs par defaut de config n'incluent pas les nouveaux champs LLM. | Ajouter `aiProvider: 'gemini'`, `ollamaModel: 'qwen2.5:7b'`, `ollamaUrl: 'http://localhost:11434'`, `aiFallback: true`. |

### Informationnels

| # | Fichier | Ligne | Probleme | Remediation |
|---|---------|-------|----------|-------------|
| 1 | `package.json` | 66 | Aucune dependance HTTP client (utilise `fetch` natif de Node 18+). Ollama utilisera le meme `fetch`. | Verifier que la version de Node embarquee dans Electron 33 supporte `fetch` natif (oui, c'est le cas). |
| 2 | `src/gemini.js` | 68-71 | `temperature: 0.3` et `maxOutputTokens: 2048` sont raisonnables pour Ollama aussi. Les parametres equivalents Ollama sont `temperature` et `num_predict`. | Mapper dans le provider Ollama. |
| 3 | -- | -- | Ollama supporte aussi un endpoint OpenAI-compatible sur `/v1/chat/completions`. Ca pourrait simplifier un futur provider OpenAI. | A garder en tete pour le futur, pas prioritaire. |

---

## Actions recommandees

### 1. Immediat (avant de coder)

- **Installer Ollama** sur la machine de dev et tester manuellement `ollama pull qwen2.5:7b` puis `curl http://localhost:11434/api/chat -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"Corrige : je mange des pomme"}],"stream":false}'`
- **Valider** que la qualite des reponses est acceptable pour les 4 prompts existants de Dikto
- **Corriger le finding #2** (Important) : migrer `showApiKeyDialog` vers `contextIsolation: true` avant d'ajouter du code, pour eviter d'heriter de ce pattern fragile

### 2. Court terme (implementation)

- Implementer les phases 1-4 dans l'ordre decrit ci-dessus
- Commencer par le refactoring pur (phase 1) et valider zero regression avant de toucher a Ollama
- Ajouter le health check Ollama et l'UX tray
- Documenter les modeles recommandes dans le README

### 3. Long terme (v2+)

- Ajouter un provider OpenAI (utiliser l'endpoint OpenAI-compatible d'Ollama comme base)
- Helper pour `ollama pull` depuis Dikto (avec barre de progression)
- Profils de prompts par provider si les tests montrent des differences significatives
- Monitoring du temps de reponse par provider (pour le debug et le choix utilisateur)

---

## Notes pour l'agent correcteur

### Ordre de modification des fichiers

1. **Creer le dossier `src/ai/`** et les 5 fichiers (provider, gemini, ollama, factory, prompt-builder)
2. **Modifier `src/gemini.js`** en dernier -- c'est la facade de compatibilite. Tant que les nouveaux fichiers ne sont pas en place, l'ancien `gemini.js` doit continuer a fonctionner.
3. **Modifier `main.js`** : remplacer les `require('./src/gemini')` par `require('./src/ai/provider-factory')`. Les points d'entree sont lignes 395, 399, 715, 755-756.
4. **Modifier `src/config.js`** : ajouter les champs dans l'objet `config` par defaut (lignes 5-40).
5. **Modifier `src/tray.js`** : ajouter le sous-menu entre "Post-processing" (ligne 195) et "Action modes..." (ligne 197).

### Points d'attention

- Ne PAS supprimer `src/gemini.js` : le garder comme facade qui redirige vers `src/ai/`. Ca evite de casser les imports existants.
- Le singleton dans `provider-factory.js` doit etre invalide quand l'utilisateur change de provider dans le tray. Appeler `resetProvider()` dans le callback `onProviderChange`.
- Les modeles Ollama changent : ne pas hard-coder la liste. Toujours la recuperer via `/api/tags`.
- Le timeout de 30 secondes pour Ollama est genereux mais necessaire : le premier appel charge le modele en memoire (~5-10s sur CPU).
- Tester le fallback avec Ollama eteint volontairement pour verifier que le basculement vers Gemini est transparent.
