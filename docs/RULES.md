# Règles implémentées — version 0.1

## Texas Hold'em No Limit

2 à 8 joueurs par table. Meilleure combinaison de 5 cartes parmi les 2 cartes privatives et le board. L'As peut être bas dans A2345. Mélange Fisher-Yates avec `crypto.randomInt` côté serveur. Aucun deck transmis au client.

Le bouton avance au siège occupé suivant. En heads-up, le bouton paie la SB et parle d'abord préflop ; la BB parle d'abord après le flop. SB = partie entière de BB/2, minimum 1. Le montant d'une relance est le total de la rue. Minimum : mise courante + dernière relance complète. Un all-in inférieur au minimum est autorisé mais ne rouvre pas à lui seul les mises à un joueur ayant déjà parlé. Plusieurs petits all-in rouvrent l'action lorsqu'ils cumulent un incrément complet par rapport à la dernière action de ce joueur.

Une seule personne ayant encore des jetons ne peut pas créer de side pot en misant seule. Elle doit seulement compléter une mise due ou se coucher. Ensuite le board est terminé automatiquement. Le surplus d'une contribution non suivie est rendu avant le calcul des pots.

Les pots sont construits à partir des seuils de contributions cumulées. Les joueurs couchés financent les pots mais ne peuvent les remporter. Chaque pot a ses propres joueurs éligibles. En cas d'égalité, partage entier ; les jetons indivisibles suivent l'ordre des sièges après le bouton. Aucune commission.

Une carte brûlée avant le flop, la turn et la première river. Le client ne reçoit jamais les burns. Au showdown, seules les cartes des joueurs non couchés sont révélées.

## Variante 7/2

Une main contenant exactement un 7 et un 2, assortis ou non, peut déclencher une prime : le joueur doit remporter seul au moins un pot et soit gagner au showdown disputé, soit avoir causé au moins un fold sur une mise/relance offensive. Le moteur mémorise l'agresseur et les folds face à sa mise. Une victoire automatique / walk n'est pas éligible. Une simple égalité sur tous les pots ne suffit pas.

Tous les autres joueurs ayant reçu des cartes sont redevables d'une BB de la main, y compris ceux qui ont foldé. Le règlement se fait après les pots principaux et secondaires, sur les jetons alors disponibles : `min(BB, stack restant)`. Pas de dette, pas de stack négatif. Un perdant all-in sans jeton paie zéro. Les transferts sont enregistrés dans `hand.bonus` et font partie de la même sauvegarde atomique que la résolution.

Si plusieurs joueurs possèdent 7-2 et remportent chacun seul un pot distinct, chacun peut recevoir sa prime ; traitement dans l'ordre des pots puis des gagnants. C'est une règle maison à confirmer avant une distribution publique.

## Ghost Poker

Le fantôme reçoit deux vraies cartes retirées du deck. Il n'a ni siège, ni stack, ni mise. Même si tous les adversaires humains foldent, le board est complété et les cartes du fantôme révélées.

Pour CHAQUE pot, le meilleur humain éligible doit strictement battre le fantôme. Une égalité avec le fantôme reporte ce pot en entier. Une victoire humaine libère ce pot, partagé entre ses gagnants humains ex æquo. Les autres pots peuvent avoir des résultats différents.

Les montants reportés sont regroupés dans le Ghost Pot de la table. À la main suivante, il devient un pot indépendant auquel tous les humains non couchés de cette nouvelle main sont éligibles, même avec un petit stack. Les droits antérieurs ne sont pas conservés : c'est volontaire et explicite. Les side pots de la nouvelle main conservent leurs propres seuils.

Lorsqu'une table ferme, son Ghost Pot rejoint celui d'une table conservée, puis éventuellement la table finale. Si un seul humain conserve des jetons, tout Ghost Pot restant lui est attribué pour clôturer le tournoi. Si le fantôme a capturé tous les jetons de tous les survivants, le gagnant de clôture est celui ayant le plus gros stack avant la dernière main ; égalité départagée par identifiant permanent dans l'ordre lexicographique. Il reçoit tous les jetons reportés. Ce cas n'est pas une redistribution d'argent.

## Red River

Préflop, flop et turn habituels. Une première river noire ferme immédiatement les mises et déclenche le showdown. Une river rouge ouvre un tour de mise puis une carte supplémentaire. Une noire termine ; une rouge recommence. Les cartes supplémentaires restent toutes sur le board. On choisit la meilleure combinaison de cinq parmi toutes les cartes disponibles et les deux cartes privatives.

Burn avant la première river uniquement, pas de burn pour les suivantes. S'il ne reste plus de carte après une river rouge, le tour de mise correspondant se termine puis showdown sur le board existant. Aucun recyclage du deck. Avec tous les joueurs all-in, on distribue automatiquement jusqu'à la noire ou l'épuisement. Si tous les adversaires foldent, le dernier humain gagne sans distribution supplémentaire.

## Tournois et transferts

`ceil(N / 8)` tables, populations différant d'au plus un joueur. Limite de version : 32 joueurs. Les tables jouent simultanément mais attendent toutes la fin de leur main avant la fenêtre de transfert. Aucune inscription ou modification des règles après lancement.

On conserve les tables existantes autant que possible ; on ferme les dernières tables devenues inutiles, puis on déplace le minimum de joueurs des tables en surnombre vers celles en sous-nombre. Les sièges conservés restent inchangés sauf protection ci-dessous. Les joueurs transférés prennent des sièges libres. Pour un simple équilibrage, on évite de choisir la dernière BB comme joueur déplacé.

Protection additionnelle à la fermeture : si un joueur transféré vient de payer la BB et devrait la payer à nouveau immédiatement, on échange son siège de destination avec celui d'un joueur n'ayant pas payé cette BB précédente, avant la nouvelle distribution. Le bouton suit ensuite le prochain siège occupé. Cette politique maison évite les doubles BB immédiates des transférés ; elle n'implémente pas toutes les règles TDA de dead button et d'équité des distances aux blinds.

Toutes les tables utilisent le niveau calculé au début du round synchronisé. BB doublée toutes les `levelSeconds`, plafonnement au niveau 13. Une main garde les blinds de son début. Aucun niveau ne modifie une main en cours.

Les stacks du tournoi sont actualisés à la fin du round. Les éliminations simultanées sont triées par stack avant la main croissant ; à égalité, identifiant permanent. Le classement est unique et enregistré dans l'état du tournoi. Aucun remboursement, réentrée, add-on ou monnaie cosmétique dans cette version.

## Audit et conservation

Après chaque action : `somme(stacks + contributions) + Ghost Pot = quantité initiale de la main`. Les pots résolus sont descriptifs : ne pas les additionner une deuxième fois. Entre les rounds et à la fin du tournoi, conservation de `nombre de joueurs × stack initial`.

Une copie de l'agrégat est modifiée, vérifiée puis enregistrée dans une transaction SQLite avec une entrée d'audit. Si une opération échoue, l'original est conservé. Les cartes privées dans le journal sont réservées à l'opérateur du serveur, jamais à une API publique.
