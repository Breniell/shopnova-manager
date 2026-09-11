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
| `npm run e2e:flows` | parcours métier sur émulateur Firebase (voir plus bas) | ~55 s |
| `npm run e2e:print` | rendu du reçu thermique, logo compris (voir plus bas) | ~13 s |
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

## Les parcours métier, sur émulateur Firebase

`npm run e2e:flows` démarre les émulateurs Auth et Firestore, lance un serveur
Vite branché dessus, et joue les parcours réels : onboarding d'une boutique
neuve, création du gérant, connexion, création d'un produit, ouverture de
session de caisse, vente en espèces, reçu.

Les assertions portent sur **la base de données autant que sur l'écran**.
Dans une application hors-ligne d'abord avec file d'attente de réémission,
« le produit s'affiche dans la liste » et « le produit est enregistré » sont
deux affirmations différentes ; le harnais lit donc Firestore directement.

Les règles de `firestore.rules` sont chargées par l'émulateur : ces parcours
les exercent réellement, ce qui n'était possible nulle part ailleurs jusqu'ici.

### Pourquoi la base réelle ne risque rien

Trois protections indépendantes :

1. **Le code livré ne peut pas parler à un émulateur.** Le branchement dans
   `src/lib/firebase.ts` est gardé par `import.meta.env.DEV`, que Vite remplace
   par le littéral `false` en build de production : la branche disparaît et les
   deux fonctions `connect*Emulator` sont éliminées avec elle.
   `scripts/verify-release.mjs` le vérifie sur l'archive `app.asar` livrée et
   refuse la release si un de ces symboles y apparaît.
2. **Le projet de test s'appelle `demo-legwan`.** Firebase traite le préfixe
   `demo-` comme réservé à l'émulateur : les SDK refusent de contacter la
   production pour un tel projet.
3. **Les tests exigent une preuve de mode émulateur.** `requireEmulatorMode()`
   échoue si l'application n'a pas annoncé la bascule, plutôt que de laisser
   une suite mal configurée écrire dans les vraies données.

### Pièges rencontrés en montant ce harnais

- **`.env` gagne contre la ligne de commande.** Passer
  `VITE_FIREBASE_PROJECT_ID` devant `vite` ne surcharge pas le `.env` du projet,
  qui pointe sur `legwan-82a09`. D'où `.env.emulator`, chargé par
  `vite --mode emulator` : la précédence `.env.[mode]` sur `.env` est la seule
  qui tienne.
- **Les lectures REST de l'émulateur exigent `Authorization: Bearer owner`**,
  sinon elles répondent `403 Metadata operations require admin authentication`.
  Une première version avalait ce 403 et renvoyait un tableau vide, ce qui se
  lisait comme « rien n'a été enregistré » et a envoyé l'enquête chercher un bug
  de persistance inexistant.
- **Le port 8080 est souvent pris** (un Apache livré avec EDB Postgres l'occupe
  sur la machine actuelle). `reuseExistingServer` de Playwright voit alors une
  réponse HTTP valide et lance toute la suite contre un serveur étranger.
  `dev:emulator` utilise 8099 avec `--strictPort`.
- **L'UI est en français, le schéma ne l'est pas** : la collection des ventes
  s'appelle `sales`, pas `ventes`.

## Impression thermique : ce qui se teste sans imprimante

**Legwan n'émet pas d'ESC/POS.** `electron/main.mjs` construit un document HTML,
le charge dans une fenêtre masquée et appelle
`webContents.print({ deviceName })`. C'est donc Chromium qui met le reçu en page,
puis le spouleur Windows qui remet le résultat au pilote de l'imprimante.
(Conséquence documentée dans le code : l'ouverture du tiroir-caisse, qui exige
une impulsion ESC/POS brute, n'est pas possible par cette voie.)

Cette architecture a une conséquence heureuse pour les tests : rendre le même
HTML dans Chromium exerce **exactement** l'étape de mise en page réelle - même
moteur, même CSS, même boîte de page en millimètres.

`npm run e2e:print` fait cela sur le vrai `buildReceiptHtml()`, en 58 mm et en
80 mm, et vérifie que le logo :

- est présent dans le document,
- **se décode réellement** (`naturalWidth > 0`) - un `data:` URI corrompu
  passerait sinon inaperçu et sortirait comme un blanc sur le rouleau,
- tient dans la largeur du papier,
- respecte le plafond de 18 mm de hauteur de la feuille de style,

et qu'une boutique sans logo ne produit **aucune** balise `<img>` (une balise
vide s'imprimerait comme une icône d'image cassée).

### Ce qui exige encore du matériel

Une seule chose : la façon dont un pilote thermique particulier convertit
l'image en noir et blanc sur un bit (tramage). C'est une propriété du pilote,
pas de Legwan. Pour la vérifier sans rouleau, on peut imprimer une fois vers
`Microsoft Print to PDF` depuis Paramètres > Imprimante : le trajet est le même
jusqu'au pilote. Ces imprimantes virtuelles demandent un nom de fichier, donc
c'est une vérification manuelle, pas automatisable.

## Emplacement d'installation : un piège opérationnel

Une installation héritée dans `C:\Program Files\Legwan` est enregistrée
**per-machine**, alors que la configuration prévoit une installation utilisateur
sans élévation. NSIS réutilise le répertoire de l'installation précédente via le
GUID stable, ce qui court-circuite `customInstallDir`. L'updater ne peut alors
pas écrire dans le répertoire cible.

Remède : désinstaller, puis relancer l'installeur **sans** « exécuter en tant
qu'administrateur ». Il se place dans `%LOCALAPPDATA%\Programs\Legwan`, et les
mises à jour suivantes s'installent sans demander de droits.
