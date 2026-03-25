# Retour d'expérience : conversion Windows → Linux (Electron)

Problèmes rencontrés lors de la conversion de **PC-Pilot** (même stack : Electron 33 + electron-builder 25, Fedora 43 Wayland). Ce document sert de checklist pour **Dikto**.

---

## 1. ELECTRON_RUN_AS_NODE (critique)

**Problème** : Le terminal intégré de VS Code définit `ELECTRON_RUN_AS_NODE=1`. Quand cette variable est présente, le binaire Electron packagé s'exécute comme **Node.js pur** au lieu d'Electron. Résultat : le binaire démarre, ne lance aucune fenêtre/tray, et quitte silencieusement (exit code 0). Aucune erreur visible.

**Symptôme** : L'app ne démarre pas depuis le terminal VS Code, mais fonctionne depuis un terminal système.

**Solutions appliquées** :
- `delete process.env.ELECTRON_RUN_AS_NODE` au tout début de `main.js` (déjà en place dans dikto)
- Dans le `.desktop` du RPM : `Exec=env ELECTRON_RUN_AS_NODE= /opt/AppName/binary %U`
- Script `npm start` : `unset ELECTRON_RUN_AS_NODE && electron .` (déjà en place dans dikto)

**Attention** : Le `delete process.env` dans main.js ne suffit PAS pour le binaire packagé — il s'exécute trop tard. La variable doit être supprimée AVANT le lancement du binaire (via le `.desktop` ou le script de lancement).

## 2. Chrome sandbox (suid)

**Problème** : Electron embarque `chrome-sandbox` qui nécessite le bit SUID root pour fonctionner. Sans ça, l'app crash silencieusement au démarrage.

**Solutions** :
- `app.commandLine.appendSwitch('no-sandbox')` dans main.js (uniquement sur Linux)
- OU `chmod 4755 chrome-sandbox` + `chown root:root chrome-sandbox` (moins pratique)

**Code** :
```js
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}
```

**Important** : Ceci doit être exécuté AVANT `app.whenReady()`.

## 3. AppImage et FUSE 2

**Problème** : Les AppImage nécessitent FUSE 2 pour se monter en filesystem. Fedora 43 n'embarque que FUSE 3.

**Solutions** :
- Installer `fuse-libs` (paquet de compatibilité FUSE 2)
- OU lancer avec `--appimage-extract-and-run` (lent, extraction à chaque lancement)
- OU fournir un `.rpm` en plus de l'AppImage (recommandé pour Fedora)

## 4. Build RPM : fpm incompatible avec RPM 6

**Problème** : electron-builder utilise `fpm` (un outil Ruby embarqué) pour générer les RPM. Ce fpm est compilé avec une vieille version de Ruby qui dépend de `libcrypt.so.1` (absente sur Fedora 43). Même après avoir installé `libxcrypt-compat`, fpm génère un `.spec` incompatible avec RPM 6 (changement de structure BUILDROOT).

**Solution** : Script `build-rpm.sh` qui construit le RPM nativement avec `rpmbuild` à partir du dossier `dist/linux-unpacked/` produit par electron-builder.

**Pré-requis sur la machine de build** :
```bash
sudo dnf install rpm-build libxcrypt-compat
```

## 5. Tray icon sous Wayland/GNOME

**Problème** : GNOME sous Wayland n'a pas de zone de notification native. Le tray Electron utilise le protocole StatusNotifierItem (SNI).

**Solution** : L'utilisateur doit installer une extension GNOME :
- `AppIndicator and KStatusNotifierItem Support` (la plus courante)
- OU `Tray Icons: Reloaded`

Sans cette extension, l'app tourne mais l'icône tray est invisible.

## 6. Auto-paste : xdotool vs ydotool

**Problème** : `xdotool` ne fonctionne PAS sous Wayland natif (il utilise X11). Dikto utilise déjà xdotool+ydotool dans son code.

**Solutions** :
- `ydotool` fonctionne sous Wayland (nécessite le service `ydotoold`)
- `wl-copy` / `wl-paste` pour le presse-papier (remplace `xclip`/`xsel`)
- `wtype` est une alternative à ydotool pour la simulation de frappe

**Vérifier** : que `src/paste.js` détecte correctement XWayland vs Wayland natif et utilise le bon outil.

## 7. Modules natifs (sherpa-onnx-node, uiohook-napi)

**Problème potentiel** : Les modules natifs (`.node` compilés en C++) doivent être recompilés pour Linux. electron-builder fait un `@electron/rebuild` automatique, mais certains modules peuvent nécessiter des dépendances de build.

**Pré-requis potentiels** :
```bash
sudo dnf install gcc gcc-c++ make python3 cmake
# Pour uiohook-napi sous Linux :
sudo dnf install libX11-devel libXt-devel libXtst-devel libXrandr-devel libXinerama-devel
# Pour audio (si nécessaire) :
sudo dnf install alsa-lib-devel pulseaudio-libs-devel
```

**Attention** : `sherpa-onnx-node` embarque des binaires pré-compilés. Vérifier qu'il inclut des binaires Linux x64.

## 8. Audio : PipeWire vs PulseAudio

**Problème** : Fedora utilise PipeWire par défaut (qui émule PulseAudio). La capture micro via Web Audio API dans Electron devrait fonctionner sans changement, mais il peut y avoir des problèmes de permissions.

**Vérifier** : que l'accès au micro fonctionne dans l'Electron packagé (pas seulement en dev).

## 9. Flags Electron CLI rejetés par le binaire packagé

**Problème** : Les flags comme `--no-sandbox`, `--disable-gpu`, `--enable-logging` passés en ligne de commande au binaire packagé sont rejetés avec `bad option`. Ils doivent être définis via `app.commandLine.appendSwitch()` dans le code JS.

## 10. Chemins de fichiers

**Checklist** :
- Config : `%APPDATA%` → `~/.config/app-name/`
- Données (modèles STT) : `%APPDATA%` → `~/.local/share/app-name/`
- Logs : vérifier que le chemin de `debug.log` est correct sur Linux
- `paste.vbs` : Windows only, ne pas inclure dans le build Linux (ou ignorer)

---

## Ordre recommandé pour la conversion

1. Ajouter `app.commandLine.appendSwitch('no-sandbox')` dans main.js
2. Vérifier/corriger les chemins de fichiers (config, modèles, logs)
3. Tester la capture audio sous Wayland
4. Tester l'auto-paste (ydotool/wtype au lieu de xdotool)
5. Tester les modules natifs (sherpa-onnx-node, uiohook-napi)
6. Build AppImage + RPM
7. Tester le tray (avec extension GNOME)
8. Tester le hotkey push-to-talk (uiohook sous Wayland)
