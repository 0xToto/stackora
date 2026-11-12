# État réel de la livraison · 12 novembre 2026

## Implémenté

| Domaine | Livré |
|---|---|
| Compte | Inscription email, pseudo unique, login, token persistant, logout |
| Tournois | Création, configuration de base, code partageable, rejoindre, lobby, lancement hôte |
| Mains | Hold'em No Limit, évaluateur, fold/check/call/raise/all-in, side pots, splits |
| Tables | 8-max, 2–32 participants, répartition équilibrée, transferts entre rounds, table finale |
| Résultats | Éliminations, classement final persistant, départage déterministe |
| Temps réel | WebSocket, projection privée, reconnect, heartbeat, polling de secours |
| Fiabilité | Autorité serveur, version, idempotence, sauvegarde transactionnelle, invariants |
| Variantes | 7/2, Ghost et Red River, règles maison documentées et tests |
| Solo | Bots serveur, ajout au lobby, tournois complets |
| Présentation | Palette émeraude/or, table 8 sièges, cartes, pot, timer, journal, logos/icônes |
| Personnalisation | 4 tapis gratuits persistés localement, jetons / BB |
| iOS | Projet Expo SDK 55, development client, EAS profiles, guide d'installation |

## Tests et niveau de preuve

- 28 tests automatisés Node du moteur, du tournoi, de REST, de WebSocket et de la persistance passent.
- Parmi eux : 1 200 mains simulées (300 par variante), tournois à 9 bots terminés dans les 4 variantes, 9 → 8 et 16 → 14, side pots et égalités dans les 4 variantes, protection double BB après transfert, uncalled bet, relances incomplètes et cumulées, confidentialité, redémarrage, idempotence, reconnexion réelle WebSocket.
- TypeScript strict : serveur et mobile vérifiés.
- Export du bundle iOS via Metro réussi ; ce n'est ni un build Xcode ni une installation physique.
- Contrôle des dépendances Expo hors ligne réussi après alignement de React Native à 0.83.10.
- Les jeux de cartes de simulation sont mélangés avec le générateur de production ; les tests de scénarios utilisent des decks déterministes.
- Les tests passent sur un serveur local, pas sur une infrastructure publique ni sous charge massive.
- Docker, EAS distant, OAuth, StoreKit et notifications Apple ne sont pas validés ici.

Le script `scripts/smoke-web.cjs` permet un test supplémentaire du même client dans Chromium à 393 × 852 : inscription, création, 8 bots, tables de 5+4 et action. Il nécessite Playwright et son navigateur, le backend et un export web servi sur le port 8081. Il n'est pas un test natif iOS.

## Non réalisé

| Fonction | Travail restant |
|---|---|
| Apple / Google / Facebook | Credentials, SDK, vérification serveur, liaison de comptes |
| Email | Envoi, vérification, reset mot de passe, suppression du compte |
| Social | Amis, demandes, présence globale, invitations persistantes, push, deep links d'invitation |
| Paramètres avancés | Dates, minimum, mot de passe, structure manuelle, antes, pauses, time bank, late reg, réentrées, add-ons, prix informatif |
| Économie | Wallet SC, ledger, attribution idempotente, anti-farming, boutique, achats de cosmétiques |
| Apple IAP | StoreKit, validation JWS/transactions, notifications serveur, remboursements, sandbox |
| Progression | XP, badges, succès, statistiques VPIP/PFR/showdown, historique consultable |
| Visuels | Skins de cartes, avatars photo, sons, haptique, animations Reanimated, shots, thème clair |
| Scalabilité | PostgreSQL, Prisma, Redis, outbox, déploiement et supervision |
| Assurance qualité | iPhone réel, VoiceOver complet, tailles/rotations, tests de charge, revue poker indépendante |
| Publication | Disponibilité du nom, confidentialité/conditions, App Store Connect, signature et TestFlight |

Ces fonctions ne sont pas présentées par des boutons factices. Les profils EAS ne signifient pas que le binaire est déjà compilé ou approuvé.

## Suite conseillée

1. Installer le development build et valider un vrai tournoi sur deux iPhones.
2. Faire relire les règles maison, notamment Ghost Pot et transferts de blinds, puis améliorer l'ergonomie native à partir des essais.
3. Ajouter la gestion des comptes complète et l'hébergement PostgreSQL autoritaire avant les invitations publiques.
4. Ajouter les paramètres de tournoi et les fonctions sociales.
5. Implémenter le ledger SC, la progression et les cosmétiques, puis StoreKit sandbox.
6. Valider les fonctionnalités natives, effectuer les tests de charge et préparer TestFlight.

## Contrôle visuel

Le bundle web a été exporté, mais le parcours Chromium automatisé n’a pas pu s’exécuter : le navigateur est bloqué au lancement par les restrictions de sockets de cet environnement. Aucun test visuel ni E2E graphique n’est donc déclaré réussi. Le script est livré pour exécution locale.
