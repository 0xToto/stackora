# STACKORA sur iPhone avec Windows, sans Mac ni abonnement Apple Developer

Le fichier `.github/workflows/iphone-ipa.yml` compile l'application iOS pour **iPhone physique** sur une machine macOS GitHub Actions. Il produit un **IPA non signé** ; Sideloadly sous Windows le signe avec votre identifiant Apple gratuit et l'installe sur votre propre iPhone.

**Important** : ce n'est pas un contournement d'Apple. Une signature Apple gratuite est nécessaire, expire généralement tous les **7 jours**, et peut être refusée selon les restrictions du compte ou de l'appareil. GitHub Actions peut également avoir des limites de consommation ou de facturation selon le dépôt et votre compte. Le build n'a pas encore été exécuté sur GitHub : un problème éventuel dans les dépendances natives devra être diagnostiqué à partir du journal Actions.

## A — Générer l'IPA

1. Dézipper le dossier `stackora` sur Windows.
2. Créer un compte GitHub, puis un dépôt GitHub personnel **privé** (ou public uniquement si vous acceptez de publier tout le code). Ne jamais envoyer les `.env`, jetons, mots de passe ou bases de données.
3. Transférer **le contenu du dossier `stackora` à la racine du dépôt** : à la racine de GitHub il doit y avoir `package.json`, `package-lock.json`, `mobile/`, `server/`, `.github/`. **Attention** : les fichiers commençant par `.` doivent aussi être transférés, notamment `.github/workflows/iphone-ipa.yml`.
4. Ouvrir le dépôt sur GitHub → onglet **Actions**. Activer Actions s'il le demande.
5. Cliquer sur **STACKORA - IPA iPhone sans compte Developer payant** puis **Run workflow** sur la branche `main`.
6. Ouvrir l'exécution terminée → **Artifacts** → `STACKORA-iPhone-IPA-non-signe`. Télécharger le ZIP de GitHub et **extraire `STACKORA-unsigned.ipa`**. Le ZIP n'est pas l'IPA.

Ce workflow utilise le macOS GitHub fourni pour une compilation native (`expo prebuild` puis `xcodebuild`) en Release, sans certificat. Il ne déclenche pas EAS et **ne demande pas `eas device:create`**.

## B — Installer le fichier sur l'iPhone depuis Windows

1. Installer Sideloadly depuis **https://sideloadly.io/**. Installer aussi iTunes/iCloud depuis les liens Apple que Sideloadly indique pour Windows, si nécessaire.
2. Connecter l'iPhone au PC en USB, le déverrouiller, accepter **Faire confiance à cet ordinateur**.
3. Ouvrir Sideloadly. Vérifier que l'iPhone est détecté.
4. Glisser `STACKORA-unsigned.ipa` dans Sideloadly, indiquer son **propre** Apple ID, puis cliquer **Start**. La signature est réalisée à cette étape, sur l'appareil associé au compte.
5. Si iOS le demande : Réglages → Général → VPN et gestion de l'appareil → faire confiance au développeur associé. Activer **Mode développeur** dans Réglages → Confidentialité et sécurité si demandé, puis redémarrer.
6. Ouvrir l'icône **STACKORA**. L'IPA Release embarque le JavaScript : **pas besoin d'Expo Go ni de Metro**.
7. La signature gratuite a normalement une durée d'environ **7 jours**. Configurer le rafraîchissement de Sideloadly, ou réinstaller la même IPA avec le même Apple ID (préserver l'identifiant de l'app).

## C — Démarrer le serveur de poker sur votre PC

L'app est installée sur l'iPhone, **mais les comptes, tournois et mains exigent toujours le backend**. Sans lui, l'interface de connexion ne peut pas fonctionner.

Sur Windows, ouvrir PowerShell dans le dossier `stackora` :

```powershell
npm ci
npm run server
```

Dans une **deuxième** fenêtre PowerShell :

```powershell
ipconfig
```

Repérer l'**adresse IPv4 du Wi-Fi** du PC, par exemple `192.168.1.42`. Mettre l'iPhone sur le **même Wi-Fi**. Dans l'écran de connexion de STACKORA, remplacer l'adresse par `http://192.168.1.42:3001` (mettre **votre** IPv4). Le serveur écoute sur toutes les interfaces réseau. Autoriser Node.js / port TCP 3001 dans le pare-feu Windows pour le réseau privé si nécessaire.

Test utile dans Safari sur l'iPhone : `http://192.168.1.42:3001/health` (remplacer l'adresse). Si Safari ne peut pas atteindre ce lien, STACKORA ne pourra pas non plus joindre le serveur. Un réseau Wi-Fi invité peut isoler les appareils.

Pour jouer hors du domicile, un **serveur distant HTTPS/WSS** est nécessaire ; celui-ci n'est pas fourni dans l'archive. N'exposez pas directement le port 3001 sur Internet sans sécurisation appropriée.

## D — Limites et dépannage

- **GitHub Actions absent** : vérifier que `.github/workflows/iphone-ipa.yml` se trouve vraiment à la racine du dépôt et sur `main`.
- **Build rouge** : ouvrir l'étape échouée dans Actions et copier les dernières lignes complètes de l'erreur. Le build n'est pas garanti avant essai réel sur GitHub.
- **Sideloadly refuse l'IPA** : fournir le texte d'erreur. L'outil doit parfois modifier des métadonnées ou extensions natives qu'il ne sait pas signer ; l'IPA n'a pas été validé sur un appareil physique.
- **Apple Developer Portal - no team** : ne plus lancer `eas device:create`. Ce processus est différent du sideloading par Apple ID gratuit.
- **L'application s'ouvre mais ne se connecte pas** : vérifier le backend, le Wi-Fi, l'IPv4 et le pare-feu Windows.
- **Après 7 jours** : rafraîchir la signature via Sideloadly ; l'application cesse de s'ouvrir si la signature n'est pas renouvelée.

Documentation : https://sideloadly.io/faq.html et https://docs.github.com/en/actions
