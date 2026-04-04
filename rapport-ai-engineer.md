# Rapport d'analyse - AI Engineer (LLM Local pour Dikto)

**Projet** : `c:/Users/David/JSCODE-PROJECT/DIKTO`
**Date** : 2026-03-26
**Agent** : AI Engineer (specialiste integration LLM et inference locale)

---

## Resume

Dikto est une application Electron bien architecturee, avec un code propre et modulaire. L'integration d'un LLM local est tout a fait faisable grace a l'abstraction claire dans `src/gemini.js` (113 lignes, interface simple avec `callGemini()` comme unique point d'appel API). Le defi principal n'est pas technique mais pragmatique : trouver le bon equilibre entre qualite de sortie (correction FR, traduction, redaction email) et ressources systeme, sachant que Dikto consomme deja ~1.2 Go de RAM avec les deux modeles STT charges.

---

## 1. Benchmark des modeles candidats (etat 2025-2026)

### Tableau comparatif

| Modele | Params | Quant Q4 (disque) | RAM inference | Correction FR | Traduction FR-EN | Vitesse CPU* | Notes |
|--------|--------|--------------------|---------------|---------------|------------------|-------------|-------|
| **Qwen 2.5 3B Instruct** | 3B | ~1.8 Go | ~2.5 Go | Bon | Bon | ~15-25 tok/s | Excellent rapport taille/qualite, multilingue natif |
| **Qwen 2.5 7B Instruct** | 7B | ~4.1 Go | ~5.5 Go | Tres bon | Tres bon | ~8-14 tok/s | Reference qualite pour cette taille |
| **Phi-4 Mini 3.8B** | 3.8B | ~2.2 Go | ~3 Go | Bon | Correct | ~12-20 tok/s | Bon en raisonnement, plus faible en multilingue |
| **Phi-3.5 Mini 3.8B** | 3.8B | ~2.2 Go | ~3 Go | Correct | Correct | ~12-20 tok/s | Predecesseur de Phi-4, moins performant |
| **Gemma 3 4B** | 4B | ~2.5 Go | ~3.5 Go | Bon | Bon | ~10-18 tok/s | Google, bon multilingue, format plus lourd |
| **Gemma 2 2B** | 2B | ~1.4 Go | ~2 Go | Faible | Passable | ~20-30 tok/s | Trop petit pour de la redaction fiable |
| **Llama 3.2 3B** | 3B | ~1.8 Go | ~2.5 Go | Correct | Correct | ~15-25 tok/s | Bon en anglais, francais moyen |
| **Llama 3.1 8B** | 8B | ~4.6 Go | ~6 Go | Bon | Bon | ~7-12 tok/s | Solide mais lourd, anglais-first |
| **Mistral 7B v0.3** | 7B | ~4.1 Go | ~5.5 Go | Bon | Bon | ~8-14 tok/s | Francais natif (Mistral AI est francais) |
| **Mistral Small 22B** | 22B | ~12 Go | ~14 Go | Excellent | Excellent | ~3-5 tok/s | Hors budget RAM pour la cible |
| **TinyLlama 1.1B** | 1.1B | ~0.7 Go | ~1.2 Go | Mauvais | Mauvais | ~35-50 tok/s | Trop petit, qualite insuffisante |
| **SmolLM2 1.7B** | 1.7B | ~1.1 Go | ~1.8 Go | Faible | Faible | ~25-40 tok/s | Ameliore vs TinyLlama mais insuffisant |

*Vitesse estimee sur CPU i5/Ryzen 5 recent, quantisation Q4_K_M, llama.cpp. Avec GPU NVIDIA, multiplier par 3-5x.

### Remarques importantes

- Les chiffres de vitesse sont des estimations basees sur des benchmarks communautaires llama.cpp (mars 2025-2026). Les performances reelles varient selon le CPU exact, la RAM, et la longueur du contexte.
- "Correction FR" et "Traduction" sont evalues sur des taches de type Dikto : phrases courtes a moyennes (10-100 mots), pas de la litterature.
- La quantisation Q4_K_M est le sweet spot reconnu : perte de qualite marginale (~1-2% sur les benchmarks) pour un gain de 60% en taille/RAM.

---

## 2. Sweet spot taille/qualite

### Le verdict : 3B est le minimum viable, 7B est confortable

**Pour la correction orthographique/grammaticale (Abc)** :
- Un modele 3B fait le travail correctement. Les fautes classiques (accords, conjugaisons, ponctuation) sont bien detectees.
- Limite des 3B : les tournures complexes, les homophones subtils (ces/ses/c'est/s'est) sont parfois rates.
- A partir de 7B, la correction est fiable meme sur des phrases alambiquees.

**Pour la traduction FR <-> EN** :
- 3B : traductions correctes pour des phrases simples a moyennes. Des erreurs de faux-amis ou de registre peuvent apparaitre.
- 7B : traductions nettement meilleures, gere mieux les idiomes et le contexte.
- Pour les autres langues (DE, ES, IT, PT, NL) : 7B minimum recommande, les 3B sont trop faibles hors FR/EN.

**Pour la redaction d'email pro** :
- C'est la tache la plus exigeante. Il faut generer du texte fluide, adapter le ton, et structurer.
- 3B : produit des emails fonctionnels mais parfois generiques ou maladroits en francais.
- 7B : emails professionnels convaincants, bonne detection du ton tutoiement/vouvoiement.

**Pour les modes custom (prompts libres)** :
- Depends du prompt. Pour des reformulations simples, 3B suffit. Pour des taches creatives ou analytiques, 7B.

### Recommandation taille

| Usage | Taille minimum | Taille recommandee |
|-------|----------------|-------------------|
| Correction (Abc) | 3B | 3B (suffisant) |
| Traduction FR<->EN | 3B | 7B (meilleur) |
| Traduction autres langues | 7B | 7B |
| Redaction email | 3B (basique) | 7B (pro) |
| Modes custom | 3B | 7B |

### Quantisation : Q4_K_M est le choix par defaut

- **Q4_K_M** : le standard de facto. ~4 bits par poids, avec une methode de quantisation intelligente (K-quants) qui preserve la qualite sur les couches critiques. Perte negligeable pour les taches de Dikto.
- **Q5_K_M** : un cran au-dessus en qualite, ~25% plus gros. A envisager si la RAM le permet.
- **Q3_K_M** : trop degrade pour de la correction/traduction fiable. A eviter.
- **Q8_0** : quasi lossless mais 2x la taille de Q4. Pas necessaire pour ces taches.

---

## 3. Runtime local : Ollama vs alternatives

### Comparatif des runtimes

| Runtime | Installation | API OpenAI | Multi-OS | Gestion modeles | Integration Electron |
|---------|-------------|------------|----------|-----------------|---------------------|
| **Ollama** | 1 installeur | Oui (natif) | Win/Mac/Linux | `ollama pull` | HTTP localhost |
| **llama.cpp (serveur)** | Build ou binaire | Oui (flag --api) | Win/Mac/Linux | Manuelle | HTTP localhost |
| **node-llama-cpp** | npm install | Non (API JS) | Win/Mac/Linux | Manuelle | In-process |
| **LM Studio** | App separee | Oui | Win/Mac/Linux | GUI | HTTP localhost |
| **llamafile** | 1 binaire | Oui | Win/Mac/Linux | Emballe avec modele | HTTP localhost |
| **vLLM** | pip install | Oui | Linux only | Docker/pip | HTTP localhost |

### Analyse detaillee

**Ollama (RECOMMANDE)**
- Avantages :
  - Installation en 1 clic (ollama.com), pas de compilation
  - API 100% compatible OpenAI (`POST /v1/chat/completions`)
  - Gestion automatique des modeles (`ollama pull qwen2.5:3b-instruct-q4_K_M`)
  - Tourne en service background, demarre avec le systeme
  - Support GPU automatique (NVIDIA CUDA, AMD ROCm)
  - Communaute enorme, catalogue de modeles pre-quantises
  - ~70 Mo d'installation (sans les modeles)
- Inconvenients :
  - Dependance externe (l'utilisateur doit installer Ollama separement)
  - Un processus de plus qui tourne en background
  - Pas de controle fin sur les parametres llama.cpp sous-jacents

**node-llama-cpp (ALTERNATIVE TECHNIQUE)**
- Avantages :
  - S'integre directement dans le process Node.js d'Electron
  - Pas de dependance externe, tout est dans le package npm
  - Controle total sur le chargement/dechargement du modele
- Inconvenients :
  - Bindings natifs = complications de build cross-platform
  - Le modele GGUF doit etre fourni/telecharge par Dikto
  - Pas d'ecosysteme de gestion de modeles
  - Electron + sherpa-onnx + llama.cpp dans le meme process = risque de conflits memoire
  - Complexite de packaging (electron-builder + native modules)

**LM Studio**
- Bon pour le dev/test mais pas comme dependance : c'est une app proprietary, payante en entreprise, et l'utilisateur final n'a pas besoin d'une UI de chat.

**llamafile**
- Interessant conceptuellement (1 binaire = runtime + modele) mais trop rigide : pas de switch de modele, pas d'API de gestion.

### Verdict runtime

**Ollama est le bon choix** pour les raisons suivantes :
1. L'utilisateur installe Ollama une fois (comme il installerait Docker ou Node.js)
2. Dikto appelle `http://localhost:11434/v1/chat/completions` — c'est du HTTP standard
3. Le meme code peut appeler Gemini ou Ollama en changeant juste l'URL et le format
4. Ollama gere le GPU automatiquement, pas besoin de code specifique dans Dikto
5. L'utilisateur peut utiliser Ollama pour autre chose aussi (c'est un outil standard)
6. Mise a jour des modeles independante de Dikto

L'alternative `node-llama-cpp` serait pertinente si Dikto voulait etre 100% standalone (sans aucune dependance externe). Mais ca alourdit enormement le packaging et la maintenance. Pour un MVP, c'est du sur-engineering.

---

## 4. Hardware minimum realiste

### Budget memoire total (Dikto + STT + LLM)

| Composant | RAM |
|-----------|-----|
| Electron + renderer windows | ~200 Mo |
| sherpa-onnx Parakeet TDT v3 (int8) | ~500 Mo |
| sherpa-onnx Whisper Turbo (int8) | ~600 Mo |
| **Sous-total Dikto actuel** | **~1.3 Go** |
| Ollama runtime | ~100 Mo |
| LLM 3B Q4_K_M | ~2.5 Go |
| LLM 7B Q4_K_M | ~5.5 Go |
| **Total avec LLM 3B** | **~3.9 Go** |
| **Total avec LLM 7B** | **~6.9 Go** |
| OS Windows 11 (base) | ~3-4 Go |
| **Grand total systeme (3B)** | **~7-8 Go** |
| **Grand total systeme (7B)** | **~10-11 Go** |

### Configurations recommandees

**Configuration minimale (LLM 3B, CPU only)** :
- RAM : 8 Go (tendu mais faisable, Windows va swapper un peu)
- CPU : Intel i5 gen 10+ ou AMD Ryzen 5 3600+
- Disque : 5 Go libres pour Ollama + modele
- Latence attendue : 2-4 secondes pour une correction, 3-6 secondes pour un email
- Note : avec 8 Go de RAM, il faudra peut-etre ne charger qu'un seul modele STT

**Configuration confortable (LLM 7B, CPU only)** :
- RAM : 16 Go
- CPU : Intel i5 gen 12+ ou AMD Ryzen 5 5600+
- Disque : 8 Go libres
- Latence attendue : 3-6 secondes pour une correction, 5-10 secondes pour un email

**Configuration optimale (LLM 7B, GPU)** :
- RAM : 16 Go
- GPU : NVIDIA RTX 3060 (12 Go VRAM) ou mieux
- Latence attendue : < 1 seconde pour une correction, 1-3 secondes pour un email
- Note : Ollama utilise automatiquement le GPU NVIDIA si CUDA est installe

**GPU AMD (ROCm)** :
- Support officiel Ollama pour les RX 6000/7000 series sous Linux
- Sous Windows, le support AMD est experimental (mi-2025). A tester.

### Impact sur l'experience utilisateur

Pour rester sous la barre des 3 secondes sur CPU :
- Les prompts de Dikto generent des reponses courtes (50-200 tokens)
- Un modele 3B Q4 a ~20 tok/s sur CPU = ~2.5-10 secondes
- Un modele 7B Q4 a ~10 tok/s sur CPU = ~5-20 secondes
- Avec GPU : 3-5x plus rapide, tout passe sous 3 secondes

La correction (Abc) est la plus rapide car la reponse est quasi identique a l'input. La traduction est rapide aussi (reponse courte). L'email est le plus lent car il genere plus de texte.

---

## 5. Architecture d'integration

### Etat actuel

Le code actuel dans `src/gemini.js` (ligne 50-87) fait un appel `fetch()` direct a l'API Gemini REST. Les fonctions exposees sont :

- `callGemini(prompt)` — appel brut
- `processBubbleAction(text, actionId)` — dictee + action (ligne 89-95)
- `processOverlayAction(text, actionId)` — texte selectionne + action (ligne 97-103)
- `processCustomPrompt(text, customPrompt)` — auto-correction (ligne 105-107)
- `getActions()` — liste des actions disponibles (ligne 28-48)

L'appel dans `main.js` se fait via `require('./src/gemini')` aux lignes 395-399 (bubble) et 715-716 (overlay).

### Architecture cible : le pattern Provider

```
src/
  ai-provider.js          # Interface + factory (nouveau)
  providers/
    gemini-provider.js     # Provider Gemini (extrait de gemini.js)
    ollama-provider.js     # Provider Ollama (nouveau)
  gemini.js                # Garde getActions() + resolution d'actions
```

### Fichier `src/ai-provider.js` (concept)

```javascript
// ai-provider.js — Factory pattern pour les providers IA
const { getConfig } = require('./config');
const { log } = require('./logger');

let currentProvider = null;

function getProvider() {
  if (currentProvider) return currentProvider;

  const config = getConfig();
  const providerType = config.aiProvider || 'gemini'; // 'gemini' | 'ollama'

  if (providerType === 'ollama') {
    const { OllamaProvider } = require('./providers/ollama-provider');
    currentProvider = new OllamaProvider(config);
  } else {
    const { GeminiProvider } = require('./providers/gemini-provider');
    currentProvider = new GeminiProvider(config);
  }

  log(`[AI] Provider: ${providerType}`);
  return currentProvider;
}

// Appele quand on change de provider dans les settings
function resetProvider() {
  currentProvider = null;
}

// Interface commune : envoyer un prompt, recevoir du texte
async function callAI(prompt) {
  const provider = getProvider();
  return provider.complete(prompt);
}

module.exports = { callAI, getProvider, resetProvider };
```

### Fichier `src/providers/ollama-provider.js` (concept)

```javascript
// ollama-provider.js — Provider Ollama (API compatible OpenAI)
const { log } = require('../logger');

class OllamaProvider {
  constructor(config) {
    this.baseUrl = config.ollamaUrl || 'http://localhost:11434';
    this.model = config.ollamaModel || 'qwen2.5:3b-instruct-q4_K_M';
    this.timeout = config.ollamaTimeout || 30000;
  }

  async complete(prompt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama error ${response.status}: ${body.substring(0, 200)}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Ollama returned empty response');
      return text.trim();

    } finally {
      clearTimeout(timer);
    }
  }

  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    return data.models || [];
  }
}

module.exports = { OllamaProvider };
```

### Modifications dans `src/gemini.js`

Le fichier `gemini.js` reste mais `callGemini()` est remplace par `callAI()` :

```javascript
// Avant (ligne 52) :
async function callGemini(prompt) { ... }

// Apres :
const { callAI } = require('./ai-provider');

// callGemini reste comme wrapper pour retrocompatibilite
async function callGemini(prompt) {
  return callAI(prompt);
}
```

Alternativement, renommer `gemini.js` en `ai.js` et adapter les imports dans `main.js` (lignes 395 et 715).

### Modifications dans `src/config.js`

Ajouter dans le config par defaut (ligne 5-40) :

```javascript
aiProvider: 'gemini',        // 'gemini' | 'ollama'
ollamaUrl: 'http://localhost:11434',
ollamaModel: 'qwen2.5:3b-instruct-q4_K_M',
ollamaTimeout: 30000,        // ms
```

### Modifications dans `src/tray.js`

Ajouter une section "AI Provider" dans le menu (apres "Post-processing", vers ligne 193) :

```javascript
// ─── AI Provider ───
{ label: 'AI Provider', enabled: false },
{
  label: 'Gemini (cloud)',
  type: 'radio',
  checked: aiProvider === 'gemini',
  click: () => { /* setConfigValue('aiProvider', 'gemini'); resetProvider(); */ }
},
{
  label: 'Ollama (local)',
  type: 'radio',
  checked: aiProvider === 'ollama',
  click: () => { /* setConfigValue('aiProvider', 'ollama'); resetProvider(); */ }
},
```

### Gestion d'erreur : Ollama non disponible

```javascript
// Dans ollama-provider.js ou ai-provider.js
async function callAI(prompt) {
  const provider = getProvider();

  try {
    return await provider.complete(prompt);
  } catch (err) {
    // Si Ollama timeout ou connexion refusee
    if (provider instanceof OllamaProvider) {
      const config = getConfig();
      if (config.aiProvider === 'ollama' && config.geminiApiKey) {
        log('[AI] Ollama failed, falling back to Gemini');
        const { GeminiProvider } = require('./providers/gemini-provider');
        const fallback = new GeminiProvider(config);
        return fallback.complete(prompt);
      }
    }
    throw err;
  }
}
```

### Schema d'integration visuel

```
Utilisateur parle / selectionne du texte
        |
        v
  [STT Parakeet/Whisper]  ou  [Clipboard]
        |
        v
  [getActions() -> buildPrompt()]  (inchange, dans gemini.js)
        |
        v
  [callAI(prompt)]  (nouveau, dans ai-provider.js)
        |
    ┌───┴───┐
    v       v
 [Gemini]  [Ollama]     <- provider selon config.aiProvider
    |       |
    v       v
  [Texte resultat]
        |
        v
  [pasteText()]  (inchange)
```

---

## 6. Traduction specifiquement

### Les petits LLM sont-ils fiables pour la traduction ?

**FR <-> EN** :
- 3B : resultats acceptables pour des phrases directes. Erreurs sur les idiomes et les faux-amis.
- 7B : bonne qualite, comparable a Google Translate pour du texte courant.
- Aucun petit LLM n'atteint DeepL ou GPT-4 en qualite de traduction.

**Autres paires (DE, ES, IT, PT, NL)** :
- Les modeles entraines principalement sur EN/FR (comme Mistral) sont faibles en DE/NL.
- Qwen 2.5 est meilleur en multilingue grace a son training sur des donnees diversifiees.
- Pour les paires FR<->DE ou FR<->NL, les 7B sont le minimum.

### Faut-il un modele specialise traduction ?

**Option A : modele generaliste (recommande pour Dikto)**
- Un seul modele pour tout (correction, traduction, email)
- Plus simple a gerer, un seul telechargement, une seule config
- Qualite "bonne" sur tout, pas "excellente" sur un domaine

**Option B : modeles OPUS-MT (Helsinki-NLP) pour la traduction**
- Modeles de traduction specialises, ~300 Mo par paire de langues
- Disponibles en ONNX (comme sherpa-onnx, meme runtime)
- Qualite de traduction superieure aux LLM generalistes de meme taille
- Inconvenient : un modele par paire (FR->EN, EN->FR, FR->DE, etc. = 12+ modeles pour 7 langues)
- Integration possible via sherpa-onnx ou directement ONNX Runtime (deja dans les dependances)

**Option C : hybride (futur possible)**
- OPUS-MT pour la traduction (rapide, specialise, leger)
- LLM pour la correction et la redaction d'emails
- Plus complexe a gerer mais meilleur resultat

### Recommandation traduction

Pour le MVP : **utiliser le LLM generaliste pour tout**, y compris la traduction. C'est plus simple et les prompts de Dikto restent identiques quel que soit le provider. La qualite sera "correcte a bonne" en FR<->EN.

Pour une v2 (si les utilisateurs remontent des problemes de qualite traduction) : ajouter OPUS-MT comme engine de traduction dedie. Dikto utilise deja ONNX Runtime via sherpa-onnx, donc le surcout technique est faible.

---

## 7. Recommandation finale

### Modele recommande

**Choix principal : Qwen 2.5 3B Instruct Q4_K_M**

- Raisons :
  - Meilleur ratio qualite/taille dans sa categorie (benchmarks mars 2025-2026)
  - Multilingue natif (entraine sur FR, EN, DE, ES, ZH, JA, etc.)
  - 1.8 Go sur disque, ~2.5 Go RAM — compatible avec 8 Go de RAM systeme
  - ~20 tokens/seconde sur CPU, suffisant pour des reponses courtes
  - Bien supporte par Ollama (`ollama pull qwen2.5:3b-instruct-q4_K_M`)
  - Licence Apache 2.0 (libre, commercial OK)
  - Correction FR : bonne. Traduction : correcte. Email : fonctionnel.

**Alternative legere : Qwen 2.5 1.5B Instruct Q4_K_M**
- Pour les machines a 8 Go de RAM tres chargees
- ~1 Go sur disque, ~1.8 Go RAM
- Qualite inferieure mais utilisable pour la correction et la traduction simple
- A proposer comme "mode leger" dans les settings

**Alternative premium : Qwen 2.5 7B Instruct Q4_K_M** (ou Mistral 7B v0.3)
- Pour les utilisateurs avec 16 Go+ de RAM ou un GPU
- Qualite quasi-Gemini Flash sur ces taches
- A proposer comme option avancee

### Runtime recommande

**Ollama** — l'utilisateur installe Ollama independamment, Dikto detecte sa presence et propose le mode local.

### Configuration minimale

| | Minimum | Recommande |
|---|---------|-----------|
| RAM | 8 Go | 16 Go |
| CPU | i5 gen10 / Ryzen 5 3600 | i5 gen12+ / Ryzen 5 5600+ |
| GPU | Pas necessaire | NVIDIA RTX 3060+ (optionnel) |
| Disque | 5 Go libres | 10 Go libres |
| Modele | Qwen 2.5 1.5B | Qwen 2.5 3B (ou 7B) |
| Latence | 3-8 secondes | 1-4 secondes |

### Plan d'integration en 3 etapes

**Etape 1 : Abstraction du provider (1-2 jours)**

Fichiers a creer/modifier :
- Creer `src/ai-provider.js` (factory + callAI)
- Creer `src/providers/gemini-provider.js` (extraire le code de callGemini)
- Creer `src/providers/ollama-provider.js` (appel HTTP localhost)
- Modifier `src/gemini.js` : remplacer `callGemini(prompt)` par `callAI(prompt)`
- Modifier `src/config.js` : ajouter `aiProvider`, `ollamaUrl`, `ollamaModel`, `ollamaTimeout`
- Les prompts et actions restent dans `gemini.js` (renommer optionnellement en `ai.js`)

Tests : verifier que Gemini fonctionne toujours exactement comme avant (pas de regression).

**Etape 2 : UI de selection + detection Ollama (1-2 jours)**

Fichiers a modifier :
- `src/tray.js` : ajouter le menu radio "AI Provider: Gemini / Ollama (local)"
- `src/tray.js` : ajouter un sous-menu pour choisir le modele Ollama (appeler `GET /api/tags`)
- `main.js` : ajouter un IPC handler pour tester la connexion Ollama
- `ui/onboarding/` : optionnellement, ajouter un step "LLM local" dans l'onboarding
- Gerer l'etat "Ollama non installe" : griser l'option, afficher un lien vers ollama.com

Tests : basculer entre Gemini et Ollama, verifier que les actions (Abc, Trad, Mail) fonctionnent avec les deux.

**Etape 3 : Robustesse et UX (1-2 jours)**

- Fallback automatique : si Ollama timeout -> essayer Gemini (si cle configuree)
- Indicateur visuel dans la bubble/overlay : icone cloud vs local
- Premiere utilisation : detecter automatiquement si Ollama est lance, proposer `ollama pull` du modele recommande
- Timeout adaptatif : CPU mode tolere plus de latence que GPU
- Documentation : README section "Mode 100% local"

---

## Findings

### Critiques

| # | Fichier | Ligne | Probleme | Remediation |
|---|---------|-------|----------|-------------|
| 1 | `src/gemini.js` | 52-87 | `callGemini()` est couple directement a l'API Gemini — impossible de brancher un autre provider sans modifier ce fichier | Extraire en pattern Provider avec interface commune `callAI(prompt)` |
| 2 | `src/config.js` | 5-40 | Aucun champ pour le choix de provider IA, URL Ollama, ou modele local | Ajouter `aiProvider`, `ollamaUrl`, `ollamaModel`, `ollamaTimeout` dans le config par defaut |

### Importants

| # | Fichier | Ligne | Probleme | Remediation |
|---|---------|-------|----------|-------------|
| 1 | `src/tray.js` | 165-296 | Le menu tray n'a pas de section pour choisir le provider IA | Ajouter une section "AI Provider" avec radio Gemini/Ollama et sous-menu modele |
| 2 | `main.js` | 395 | `require('./src/gemini')` est appele inline a chaque action — pas de cache du provider | Centraliser via `ai-provider.js` avec singleton lazy-loaded |
| 3 | `src/gemini.js` | 4-5 | Le modele Gemini est hardcode (`gemini-2.5-flash-lite`) | Rendre configurable dans config.js (sera aussi utile quand Google sortira de nouveaux modeles) |

### Moyens

| # | Fichier | Ligne | Probleme | Remediation |
|---|---------|-------|----------|-------------|
| 1 | `src/gemini.js` | 60-73 | Pas de timeout sur le fetch() Gemini — si l'API est lente, Dikto reste bloque | Ajouter AbortController avec timeout configurable (15s par defaut) |
| 2 | `main.js` | 145 | Pas de check au demarrage si Ollama est disponible (futur) | Ajouter un health check Ollama au boot, mettre a jour le status dans le tray |
| 3 | `preload.js` | 1-45 | Pas d'IPC pour les settings du provider IA | Ajouter `getAiProvider()`, `setAiProvider()`, `testOllamaConnection()` |

### Informationnels

| # | Fichier | Ligne | Probleme | Remediation |
|---|---------|-------|----------|-------------|
| 1 | `src/stt.js` | 113-118 | Les deux modeles STT sont charges en memoire simultanement (~1.1 Go) | Si la RAM est critique (8 Go + LLM), envisager un mode "single STT" qui ne charge que Parakeet |
| 2 | `package.json` | 66 | Pas de dependance a un client HTTP specifique (utilise fetch natif de Node 18+) | Fetch natif est parfait pour Ollama, pas besoin d'ajouter axios ou node-fetch |
| 3 | — | — | Les prompts sont en francais dans config.js (ligne 16-27) | Les prompts francophones fonctionnent aussi bien avec Qwen 2.5 qu'avec Gemini — pas de changement necessaire |
| 4 | — | — | Ollama sur Linux Fedora/Wayland : aucune complication specifique | Ollama est un binaire Go standalone, pas d'interaction avec le display server |

---

## Actions recommandees

1. **Immediate** : Creer la couche d'abstraction `ai-provider.js` + les deux providers. Le code de `callGemini()` ne change pas de comportement, juste de localisation. Zero risque de regression si bien fait.

2. **Court terme** : Ajouter la selection du provider dans le tray menu. Tester avec Ollama + Qwen 2.5 3B sur une machine 8 Go pour valider la latence reelle. Ajuster le timeout en consequence.

3. **Long terme** : Evaluer l'ajout d'OPUS-MT pour la traduction si les retours utilisateurs montrent des faiblesses sur les paires non FR-EN. Envisager `node-llama-cpp` si Dikto veut un jour etre 100% standalone sans dependance Ollama.

---

## Notes pour l'agent correcteur

L'implementation doit se faire en 3 etapes distinctes, chacune testable independamment :

1. **Etape 1** : Ne toucher a `gemini.js` qu'apres avoir cree `ai-provider.js` et `providers/gemini-provider.js`. Tester que toutes les actions (Abc, Trad, Mail FR, Mail EN, custom) fonctionnent identiquement via le nouveau path. Les prompts et `getActions()` ne bougent pas.

2. **Etape 2** : Le menu tray doit griser "Ollama (local)" si Ollama n'est pas detecte au demarrage. Un test HTTP vers `http://localhost:11434/api/tags` avec timeout 3s suffit. Si Ollama est detecte mais qu'aucun modele n'est installe, afficher "(no model — run: ollama pull qwen2.5:3b)".

3. **Etape 3** : Le fallback Gemini ne doit s'activer que si une cle API Gemini est configuree ET que l'utilisateur a explicitement choisi "Ollama" comme provider. Ne pas fallback silencieusement — afficher une notification (ou un log visible dans le tray tooltip) du type "Ollama unavailable, using Gemini".

Regles strictes :
- Ne pas ajouter de dependance npm (fetch natif suffit pour HTTP)
- Respecter la CSP existante (`script-src 'self'`) dans tous les HTML
- Utiliser `addEventListener` pas `onclick` inline
- Chiffrer les eventuelles nouvelles cles/tokens via `safeStorage` comme pour la cle Gemini
- Tester sur Windows ET Linux avant merge
