# STACKORA · version jouable 0.1

Your table. Your rules.

Application React Native / Expo et serveur de poker privé. Cette livraison réalise le premier parcours jouable : compte email, tournoi, invitation par code, bots, mains complètes, multi-tables et résultats. Elle n'est pas la réalisation intégrale du cahier des charges ni une application déjà publiée ou signée pour iOS.

**Installation sur iPhone depuis Windows, sans Mac et sans compte Apple Developer payant :** voir [docs/INSTALLER_IPHONE_WINDOWS_GRATUIT.md](docs/INSTALLER_IPHONE_WINDOWS_GRATUIT.md). Le workflow `.github/workflows/iphone-ipa.yml` produit un IPA non signé pour Sideloadly. La compilation et l’installation sur appareil n’ont pas été validées.

## Démarrer sur votre ordinateur

Prérequis : **Node.js 24**, npm, deux terminaux. Décompresser l'archive puis ouvrir un terminal dans `stackora`.

```sh
npm ci
npm test
npm run server
```

Le serveur écoute sur `0.0.0.0:3001`. Sa base SQLite est créée automatiquement dans `server/stackora.sqlite` avec le lancement npm ci-dessus. `/health` permet de vérifier qu'il répond. Les comptes et parties sont conservés au redémarrage. Ne lancer qu'une instance du serveur sur une base.

Deuxième terminal :

```sh
cd mobile
npm run start
```

Le client nécessite un development build installé sur l'iPhone : suivre **[docs/IPHONE.md](docs/IPHONE.md)**. Ce dépôt ne contient pas d'IPA signé. La génération du bundle JavaScript iOS ne remplace pas une compilation native.

Sur l'écran de connexion, remplacer l'adresse de serveur proposée par `http://IP_LOCALE_DU_PC:3001`. Par exemple `http://192.168.1.42:3001`. L'iPhone et le PC doivent être sur le même réseau Wi-Fi. Sur Windows, trouver l'IPv4 avec `ipconfig` et autoriser Node sur le réseau privé dans le pare-feu. `localhost` sur l'iPhone désigne l'iPhone, pas le PC.

### Premier tournoi solo

1. Créer un compte email avec un pseudo unique et un mot de passe de 10 caractères minimum. Utiliser un mot de passe dédié aux essais : aucune vérification d'adresse ni récupération de mot de passe n'est encore intégrée.
2. Créer un tournoi, par exemple 16 participants maximum, stack 2 000, BB 50.
3. Ajouter 7 bots dans le lobby et lancer. Ajouter 8 bots pour tester 9 participants sur deux tables de 5 et 4.
4. Jouer avec les boutons Passer / Parole / Suivre / Relancer. La relance est le montant TOTAL engagé sur la rue, pas l'incrément.
5. Les bots jouent depuis le serveur. À expiration du temps : parole si possible, sinon fold.
6. Après chaque main, attendre la fin des autres tables puis quatre secondes d'affichage des résultats.
7. Revenir à l'accueil pour retrouver la partie ; elle continue même si l'application est fermée.

### Jouer avec des amis

Chaque ami utilise un compte distinct et le même serveur. Partager le code depuis le lobby ; chacun choisit « Rejoindre la table ». L'organisateur démarre après les inscriptions. Pas d'inscription tardive dans cette version. Pour des amis hors du Wi-Fi, héberger le backend sur une machine accessible en HTTPS/WSS avec stockage persistant. Aucun backend public n'est déployé par cette livraison.

### Essai facultatif dans un navigateur

Le même client peut être utilisé localement pour faciliter les essais avant le build iOS. Les sessions web restent en sessionStorage, les sessions natives dans SecureStore.

```sh
# terminal serveur, macOS/Linux
CORS_ORIGIN=http://localhost:8081,http://127.0.0.1:8081 npm run server
# terminal mobile
cd mobile
npx expo start --web
```

PowerShell, pour configurer le serveur :

```powershell
$env:CORS_ORIGIN="http://localhost:8081,http://127.0.0.1:8081"
npm run server
```

Saisir `http://localhost:3001` comme serveur sur le navigateur du même ordinateur. Le support web est un outil de test, pas une application web hébergée.

## Contenu

| Dossier | Rôle |
|---|---|
| `mobile/app` | Écrans React Native, entrée Expo Router |
| `mobile/src` | Session, transport, types et stockage local |
| `mobile/assets` | Logo SVG, PNG transparent, icône 1024, splash, favicon |
| `server/src/cards.ts` | Mélange cryptographique, évaluateur de cinq cartes parmi N |
| `server/src/engine.ts` | Règles des mains, mises, side pots, variantes |
| `server/src/tournament.ts` | Répartition, transferts, bots, éliminations, résultats |
| `server/src/app.ts` | REST, WebSocket, autorisation, boucle de jeu |
| `server/src/store.ts` | Comptes, sessions, transactions et journal SQLite |
| `server/migrations` | Schéma initial SQLite, réexécutable |
| `server/test` | Tests du moteur et des transports |
| `docs` | Installation iPhone, règles, architecture et statut |

## Commandes de vérification

```sh
npm run typecheck
npm test
cd mobile
npx expo install --check
npx expo export --platform ios
```

Le projet verrouille Expo SDK 55 et React Native 0.83.10 dans `package-lock.json`. `npm ci` reproduit l'installation. Le contrôle Expo hors ligne utilise la matrice livrée avec le SDK ; il ne valide pas les services EAS.

Le fichier `compose.yaml` propose aussi un serveur Docker avec volume persistant : `docker compose up --build`. Cette recette n'a pas été exécutée ici.

## Limites de cette version

- SQLite et un serveur mono-processus ; aucune migration vers PostgreSQL / Prisma / Redis réalisée.
- 32 joueurs maximum ; tables synchronisées entre les mains. Les bots sont des joueurs de test simples, sans stratégie GTO.
- Pas d'argent réel, de Stack Coins, de boutique payante ni de StoreKit. Quatre tapis gratuits locaux et affichage jetons / BB sont disponibles.
- Pas d'OAuth, de vérification email, de récupération/suppression de compte, de liste d'amis, de push, de statistiques agrégées, de réentrées ou d'antes.
- Pas encore d'animations avancées, de mode clair ni de validation ergonomique sur un véritable iPhone.
- Les trois variantes suivent des règles maison explicites dans [docs/RULES.md](docs/RULES.md).
- Pas de recherche de disponibilité commerciale de STACKORA effectuée. L'identifiant `com.stackora.mobile` doit être adapté à votre compte et sa disponibilité vérifiée avant publication.

Voir [docs/STATUS.md](docs/STATUS.md) pour le périmètre détaillé et les prochaines étapes.
