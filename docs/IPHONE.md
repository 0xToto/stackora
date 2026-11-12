# Installer et tester sur iPhone

## Ce qui est fourni et ce qui manque

Les sources natives Expo, l'icône, le splash et les profils EAS sont fournis. Aucun certificat Apple, compte Expo, compte Apple Developer, projet EAS ou IPA n'est inclus. Aucune compilation native, installation physique ou soumission TestFlight n'a été effectuée dans cet environnement Linux.

La méthode ci-dessous fonctionne depuis Windows, macOS ou Linux via le service EAS. L'installation ad hoc sur appareil avec EAS requiert un compte Apple Developer actif et l'enregistrement de l'iPhone. Consulter les sources officielles en bas de page pour les étapes de signature.

## 1. Préparer le projet

À la racine du dossier extrait :

```sh
npm ci
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

Choisir votre propre projet Expo. `eas init` ajoute le `projectId` réel : ne pas en inventer un. Adapter `ios.bundleIdentifier` dans `app.json` si `com.stackora.mobile` n'est pas disponible pour votre équipe.

Le fichier `eas.json` est déjà fourni, avec profils development, simulator, preview et production. Aucun secret n'est à placer dans les sources.

## 2. Enregistrer l'iPhone et compiler

```sh
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile development
```

Ouvrir le lien d'enregistrement sur l'iPhone. Pendant le build, autoriser EAS à gérer les certificats et profils de votre équipe Apple, puis sélectionner l'iPhone enregistré.

Installer le build depuis le lien ou QR code fourni par EAS. Activer le mode développeur si iOS le demande : Réglages → Confidentialité et sécurité → Mode développeur, puis redémarrer et confirmer.

## 3. Démarrer le serveur et Metro

Terminal 1, à la racine du projet :

```sh
npm run server
```

Terminal 2 :

```sh
cd mobile
npx expo start --dev-client --lan
```

Sur l'iPhone, ouvrir STACKORA et sélectionner le serveur Metro / scanner son QR code. Accepter l'accès au réseau local. Saisir l'adresse IP du PC avec le port 3001 sur l'écran de connexion. On peut aussi copier `mobile/.env.example` vers `mobile/.env` et modifier `EXPO_PUBLIC_API_URL` avant le lancement de Metro.

Le QR code Metro ouvre le code de l'application ; il n'héberge pas le backend. Un tunnel Metro ne rend pas automatiquement le serveur de poker accessible.

## 4. Essai de bout en bout

- Créer deux comptes sur deux appareils, ou un compte et quelques bots.
- Créer puis rejoindre le même tournoi grâce au code.
- Lancer, jouer une main et comparer les stacks, le board et les pots sur les deux appareils.
- Vérifier que seules ses propres cartes sont visibles avant le showdown.
- Fermer/réouvrir l'application puis rouvrir le tournoi. Tester la perte du Wi-Fi ; le serveur continue et applique les timeouts.
- Tester 9 joueurs (5 + 4), puis attendre la fusion à 8 joueurs.
- Refaire une partie dans chacune des variantes ; les scénarios précis sont aussi automatisés dans `server/test`.
- Essayer chaque tapis et le changement jetons / BB.

## Autres modes

### Build autonome de test

```sh
npx eas-cli@latest build --platform ios --profile preview
```

Il inclut le bundle sans avoir besoin de Metro. Le backend reste nécessaire. Renseigner une URL serveur accessible avant le build ou sur l'écran de connexion. Tous les iPhones destinataires doivent être autorisés par le profil ad hoc.

### Simulateur iOS sur Mac

```sh
npx eas-cli@latest build --platform ios --profile simulator
```

Ou compilation locale avec Xcode installé :

```sh
npx expo run:ios
```

### TestFlight, plus tard

Avant cette étape : hébergement HTTPS, suppression des exceptions HTTP de développement dans `app.json`, privacy policy, effacement du compte, validation des fonctionnalités natives et vérification du nom. Le profil production est préparé, pas validé.

```sh
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

Cela nécessite App Store Connect et les droits Apple appropriés. Ne pas envoyer cette version telle quelle en publication publique.

## Dépannage

| Symptôme | Vérification |
|---|---|
| Connexion impossible | Serveur démarré, même Wi-Fi, IPv4 correcte, port 3001 autorisé |
| QR ne s'ouvre pas | Development build installé, bon projet Metro, appareil enregistré |
| La partie avance pendant l'absence | Comportement prévu : timers serveur, parole/fold automatique |
| État modifié lors d'une action | Une autre action a été enregistrée ; le client recharge l'état, puis rejouer si c'est encore votre tour |
| Session invalide | Se déconnecter et se reconnecter ; la déconnexion locale fonctionne même si le serveur ne répond plus |
| Expo Go refuse le SDK | Utiliser le development build ; ne pas compter sur Expo Go pour ce dépôt |

## Références officielles consultées

- https://docs.expo.dev/get-started/set-up-your-environment/?device=physical&mode=development-build&platform=ios
- https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/
- https://docs.expo.dev/build/internal-distribution/
- https://docs.expo.dev/guides/ios-developer-mode/
- https://docs.expo.dev/build/eas-json/
