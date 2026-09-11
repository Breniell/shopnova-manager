# Tester Legwan sans installer ni désinstaller

Ce document existe pour une raison précise : la mise à jour automatique a été
cassée dans six versions publiées (1.6.0, 1.7.0, 1.7.1, 1.7.2, 1.7.3, 1.7.4),
pour trois causes distinctes, chacune masquant la suivante. Toutes ces versions
passaient les contrôles statiques du paquet construit. Aucun de ces contrôles ne
pouvait observer la seule chose qui comptait : est-ce que l'updater démarre.

La vérification retombait donc sur l'utilisateur, à coups d'installation et de
désinstallation manuelles. Ce n'est plus nécessaire.

## Le piège qui rendait tout cela impossible

`ELECTRON_RUN_AS_NODE=1` est présent dans l'environnement des terminaux
intégrés de VS Code, et il est hérité par tout ce qu'on y lance. Avec cette
variable, un binaire Electron démarre en **simple processus Node** : pas de
fenêtre, pas de renderer, pas de journal de diagnostic, et une sortie immédiate
avec `bad option: --user-data-dir`.

C'est ce qui avait fait conclure, à tort, qu'une application graphique ne
pouvait pas être lancée depuis ce terminal. Le harnais de test supprime cette
variable de l'environnement enfant (`tests/electron-harness.ts`). Si un jour un
lancement Electron « sort tout de suite sans rien écrire », vérifier cette
variable **avant** toute autre hypothèse.

## Les commandes

| Commande | Ce qu'elle teste | Durée |
|---|---|---|
| `npm test` | 650+ tests unitaires et composants (dont la bannière de mise à jour) | ~5 min |
| `npm run test:electron-runtime` | processus principal : journal, sauvegardes, interop updater, packaging | ~5 s |
| `npm run e2e:electron` | **l'app packagée réelle**, mise à jour de bout en bout | ~45 s |
| `npm run smoke:offline:packaged` | démarrage hors-ligne de l'app packagée | ~40 s |

`npm run e2e:electron` exige un build préalable : `npm run dist:client`.

## Comment le test de mise à jour fonctionne

`tests/e2e-electron/update-flow.spec.ts` lance le vrai binaire packagé et le
fait dialoguer avec un serveur HTTP local qui joue le rôle du serveur de
publication et annonce une version 99.0.0.

Toute la chaîne s'exécute pour de vrai : récupération du manifeste, comparaison
de versions, téléchargement de l'installeur, vérification de la somme SHA-512,
puis remontée de l'événement jusqu'au renderer via le pont de préchargement.

Deux propriétés importantes :

- **Rien n'est publié sur GitHub.** Aucune fausse mise à jour n'est envoyée à un
  commerçant. Le serveur n'écoute que sur `127.0.0.1`.
- **Aucune installation n'est touchée.** Chaque exécution reçoit un
  `--user-data-dir` jetable, donc son propre onboarding et son propre journal.
  Le verrou d'instance unique d'Electron étant lié à ce dossier, le test
  cohabite avec un Legwan que vous êtes en train d'utiliser.

Le fichier `resources/app-update.yml` du build est réécrit le temps du test puis
restauré. Les tests s'exécutent en série (`workers: 1`) parce que ce fichier est
un état partagé dans `release/win-unpacked`.

## Répartition de la couverture de la bannière

La bannière ne s'affiche que dans `AppLayout`, donc après l'onboarding et une
connexion qui écrirait dans le projet Firestore de production. La couverture est
donc découpée en deux, volontairement :

- `tests/e2e-electron/update-flow.spec.ts` prouve que **l'événement arrive**,
  avec la bonne version, depuis l'app packagée réelle.
- `src/test/components/UpdateBanner.test.tsx` prouve que **l'événement devient
  une bannière** : le texte exact affiché au commerçant, le bouton qui déclenche
  le téléchargement, la progression, l'état « prête à installer », le rejet.

## Ce qui n'est pas encore automatisé

Les parcours métier (gérant, caissier, super-admin : produits, ventes, session
de caisse, rapports) touchent le projet Firebase de production `legwan-82a09`.
Il n'y a pas d'émulateur configuré : `firebase.json` n'a pas de bloc
`emulators` et `src/lib/firebase.ts` n'a aucun branchement.

Tant que ce n'est pas fait, ces parcours se testent comme lors de l'audit QA du
19/08 : boutiques préfixées `TEST -`, puis nettoyage via `service-account.json`
et `db.recursiveDelete()` (Firestore `boutiques/{id}` + `registry/{id}` + le
compte Auth du même uid).

## Emplacement d'installation : un piège opérationnel

Une installation héritée dans `C:\Program Files\Legwan` est enregistrée
**per-machine**, alors que la configuration prévoit une installation utilisateur
sans élévation. NSIS réutilise le répertoire de l'installation précédente via le
GUID stable, ce qui court-circuite `customInstallDir`. L'updater ne peut alors
pas écrire dans le répertoire cible.

Remède : désinstaller, puis relancer l'installeur **sans** « exécuter en tant
qu'administrateur ». Il se place dans `%LOCALAPPDATA%\Programs\Legwan`, et les
mises à jour suivantes s'installent sans demander de droits.
