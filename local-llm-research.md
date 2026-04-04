# Dikto — Recherche LLM Local

## Objectif

Rendre Dikto 100% souverain en ajoutant une option LLM local comme alternative a Gemini pour toutes les fonctions IA :
- Correction grammaire/orthographe (Abc)
- Traduction (Trad)
- Redaction email (Mail FR, Mail EN)
- Modes custom

## Contraintes

- Doit tourner sur des configs modestes (8 Go RAM, pas de GPU dedie)
- Assez puissant pour la correction, traduction et redaction d'emails
- Rapide (< 3-5s par requete pour rester utilisable)
- Integration simple (API compatible OpenAI ou Ollama)
- Ne pas alourdir le binaire Dikto (le LLM est externe)
- Option dans les settings : Gemini (cloud) OU LLM local — au choix de l'utilisateur

## Questions pour les agents

1. Quel(s) modele(s) LLM sont les meilleurs candidats ? (Phi-3, Mistral, Gemma, Llama, Qwen...)
2. Quelle taille de modele est le sweet spot qualite/vitesse/RAM ?
3. Ollama comme runtime local — est-ce le bon choix ?
4. Comment gerer la traduction avec un petit modele ? (qualite suffisante ?)
5. Faut-il un modele different pour chaque tache ou un seul polyvalent ?
6. Quel est le minimum hardware realiste ?
7. Comment integrer ca dans l'architecture Electron existante (src/gemini.js) ?
