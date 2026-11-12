# Architecture et décisions

## Flux d'une action

Client Expo → REST authentifié (ou commande WebSocket) → contrôle version/idempotence → copie du tournoi → moteur de main → invariant de jetons → transaction SQLite (état + audit) → publication WebSocket personnalisée.

Le serveur Node mono-processus traite les mutations synchrones sans `await` à l'intérieur du commit. Cela sérialise les commandes et la boucle de timer. Une mutation non valide ne remplace jamais l'état en mémoire. La sauvegarde est commitée avant la publication réseau. Après redémarrage, les états chargés depuis SQLite reprennent leurs deadlines et leurs decks exacts.

## Domaines

- `cards.ts` : mélange crypto, classification et comparaison des mains. L'évaluateur explore toutes les combinaisons de 5, adapté aux boards variables mais à optimiser avant de monter en charge.
- `engine.ts` : machine à états préflop/flop/turn/river/done, règles de relance, résolution des pots et variantes. Pas d'accès au stockage ni à l'interface.
- `tournament.ts` : inscription, tables, début de rounds, bots, timers, éliminations et classement. Pas de socket ni de SQL.
- `store.ts` : SQLite WAL et transactions synchrones. Migrations initiales réexécutables, scrypt salé, token de session aléatoire 256 bits stocké sous forme de hash serveur.
- `app.ts` : HTTP/WebSocket, validation Zod, authentification, contrôle des membres et rôle organisateur, limite de corps, limites de débit, heartbeat et projection de visibilité.
- `mobile/src/useStackora.ts` : transport, session native Keychain / web sessionStorage, resynchronisation. `types.ts` ne contient aucun moteur ni secret.

## Stockage

| Table SQLite | Contenu |
|---|---|
| users | Identifiant immuable, pseudo unique, email, scrypt + sel |
| sessions | Hash du token, user_id, expiration à 30 jours |
| tournaments | Identifiant, code unique, agrégat JSON autoritaire |
| audit | Snapshot serveur complet à chaque commit, version et horodatage |

Les cartes privées sont présentes uniquement dans l'agrégat serveur et l'audit local. Le fichier de base et ses sauvegardes doivent rester privés. Aucun endpoint de lecture de l'audit n'est exposé. La liste des parties ne retourne que celles auxquelles l'utilisateur est inscrit. La souscription WebSocket contrôle aussi cette appartenance.

Le schéma n'est pas une prétendue réalisation de toutes les entités du cahier des charges : les éléments nécessaires au premier parcours sont regroupés dans l'agrégat. Aucune transaction de monnaie cosmétique n'existe encore.

## Protocole

- REST : `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /me`.
- `POST /tournaments`, `GET /tournaments`, `POST /join {code}`.
- `GET /tournaments/:id` ; `POST .../bots {count}`, `.../start {}`, `.../action`.
- Action : `{actionId, version, type: "fold"|"check"|"call"|"raise", amount?}`.
- `GET /ws` : WebSocket, premier message `{type:"auth", token}` dans 5 secondes. Token absent de l'URL.
- Après `authenticated`, envoyer `{type:"subscribe", id: tournamentId}`.
- Réception : `{type:"state", state}` ou `{type:"error", error}`.
- Action WebSocket facultative : `{type:"action", command: {actionId, version, type, amount?}}`.

Les dernières 2 000 clés utilisateur/action sont dédupliquées. Une ancienne commande non conservée est rejetée par sa version périmée. Une réponse perdue se récupère en rechargeant l'état ; le client n'envoie pas automatiquement une mise devenue ambiguë. La version est globale au tournoi, donc une action d'une autre table peut nécessiter une resynchronisation. C'est une simplification à remplacer par des versions de table lorsque la charge augmente.

WebSocket : ping/pong toutes les 30 secondes, reconnexion client toutes les 2 secondes, récupération REST toutes les 5 secondes en complément. Un joueur absent continue à payer ses blinds et joue check/fold à échéance. Le serveur gère aussi les bots avec la même fonction `act` que les humains.

## Pourquoi SQLite / Fastify pour ce lot

Ils permettent de lancer et tester le produit avec Node sans provisionner de services externes, tout en ayant une vraie persistance et des commits atomiques. Le code TypeScript reste séparé par domaines. Les limites sont explicites : un seul processus, pas de verrou distribué, pas de réplication, pas de Redis. Ne pas lancer plusieurs serveurs sur la même base.

Pour évoluer : PostgreSQL avec contrôle optimiste `UPDATE ... WHERE version = ?`, transaction commune état/événement/outbox, propriétaire de table unique par partition, Redis pour présence/pubsub uniquement, jamais source unique de vérité des jetons. Remplacer le snapshot complet par événements vérifiables et checkpoints, appliquer une rétention d'audit, mesurer la charge, ajouter un observateur des timers et reprise contrôlée.

## Préparation production restant à faire

TLS, reverse proxy avec rate limits partagés, secrets via environnement, email vérifié et récupération, suppression de compte, session renouvelable/révoquée par appareil, journal d'authentification, protection des sauvegardes, tests de charge et de chaos, revue du moteur indépendante. Retirer `NSAllowsArbitraryLoads` avant une distribution publique. Le HTTP local présent sert uniquement au développement.

L'économie cosmétique, OAuth, notifications et StoreKit doivent être ajoutés comme domaines séparés. Les Stack Coins ne doivent jamais entrer dans l'invariant des jetons du tournoi.
