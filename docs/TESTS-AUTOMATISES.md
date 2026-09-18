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
| `npm run e2e:flows` | parcours métier sur émulateur Firebase (voir plus bas) | ~3 min |
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

### Plusieurs postes de caisse

`tests/e2e-flows/multi-poste.spec.ts` simule deux ordinateurs par deux
contextes de navigateur isolés (chacun son stockage local, donc son code caisse
et son cache hors-ligne) sur la même boutique. Il vérifie : l'ajout d'un poste
par la récupération cloud, le partage des comptes, des codes caisse distincts,
l'addition des ventes simultanées, **la réconciliation d'une vente faite
hors-ligne pendant qu'un autre poste vend en ligne** (stock final 3 et non 4,
donc aucune écriture écrasée), la rupture vue en temps réel sur l'autre poste,
et l'unicité des numéros de vente.

Il consigne aussi deux observations sans échouer : le compte gérant provisoire
qu'une installation neuve oblige à créer disparaît bien après restauration,
mais la boutique qu'il a créée reste orpheline dans le projet Firebase.

### La clôture de caisse

`tests/e2e-flows/cloture.spec.ts` joue un service complet — vente en espèces,
vente Mobile Money, vente à crédit — puis compte le tiroir.

Trois nombres sont faciles à confondre, et coûteux quand on les confond :

- **le Mobile Money est du chiffre d'affaires, mais il n'est pas dans le
  tiroir** ;
- **une vente à crédit n'est ni l'un ni l'autre** : rien n'a été encaissé ;
- **le fond à comparer est celui déclaré à l'ouverture de la session**, pas le
  fond par défaut de la boutique. Le test ouvre exprès avec 7 500 alors que le
  défaut est 10 000, pour que les deux ne puissent pas se confondre.

Le test vérifie ensuite qu'un tiroir incomplet est signalé (« Manque en
caisse » plus l'avertissement d'écart important), qu'un comptage exact donne un
écart nul, et qu'après validation la clôture **et** la session de caisse sont
écrites dans Firestore avec les mêmes chiffres. Enfin, que la caisse se referme :
le caissier ne peut plus vendre sans rouvrir une session.

### Le crédit et les règlements

`tests/e2e-flows/credit.spec.ts` couvre les deux règles qui protègent
l'argent du commerçant :

- **le plafond du client arrête réellement la vente** — le bouton « Valider la
  vente » se désactive, il ne se contente pas d'afficher un avertissement ;
- **un règlement encaissé sur une ancienne dette est de l'argent entré dans le
  tiroir aujourd'hui**, donc la clôture doit l'attendre. Le test vend
  uniquement à crédit, encaisse 5 000 sur la dette, et vérifie que la clôture
  attend bien ces 5 000 en espèces.

Il vérifie aussi qu'un règlement partiel fait passer la vente de « En attente »
à « Partiel », libère la marge nécessaire pour une nouvelle vente à crédit, et
qu'il est rattaché à la session de caisse en cours.

### La console super-admin

`tests/e2e-flows/superadmin.spec.ts` couvre la console développeur, empaquetée
dans le serveur de test parce que `.env.emulator` fixe
`VITE_ENABLE_SUPERADMIN=true` (la variante client passe `false`, et ce fichier
n'est lu que par `vite --mode emulator` : rien de livré au commerçant n'est
touché).

Le test est construit autour de la distinction qui a fait passer la console
pour cassée pendant des semaines — **il faut deux droits sans rapport** :

1. l'adresse connectée doit être exactement `VITE_SUPERADMIN_EMAIL` : cela
   ouvre les écrans, et c'est une constante de compilation ;
2. le compte Firebase doit porter le droit `superadmin`, que `firestore.rules`
   contrôle avant toute lecture du registre. **Déployer les règles ne l'accorde
   pas** : seul le SDK Admin le fait (`npm run staff:claims`).

Le test crée donc le compte avec l'adresse mais **sans** le droit, constate que
la console laisse entrer puis refuse toutes les données, accorde le droit comme
le ferait `staff:claims`, se reconnecte — un droit n'atteint le client que sur
un jeton neuf — et vérifie que la boutique apparaît enfin. Il parcourt ensuite
les cinq onglets, dont la Carte qui plantait à l'audit du 19/08/2026.

Le second test vérifie qu'un **compte Firebase valide mais qui n'est pas le
super-admin** est refusé, et qu'aucun code d'erreur Firebase brut ne s'affiche.

### Ces tests peuvent-ils échouer ?

Un test qui ne peut pas échouer est pire qu'aucun test : il rassure à tort.
Les deux ci-dessus ont donc été vérifiés par mutation du code de production —
Mobile Money ajouté au montant attendu dans le tiroir, contrôle du plafond
retiré de la condition de validation. Les deux ont échoué au bon endroit
(« attendu 12 500, reçu 15 500 » ; « bouton attendu désactivé, reçu activé »),
puis le code a été remis en l'état.

C'est la précaution qui manquait quand l'autorisation gérant est restée morte
cinq versions durant.

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
- **Les onglets de paiement portent un émoji** (« 💵 Espèces », « 📱 Mobile »,
  « 🧾 Crédit »). Un nom accessible exact ne correspond jamais ; il faut une
  expression régulière sur le mot.
- **Un libellé peut s'attraper lui-même.** « Écart important détecté » contient
  « Écart » : viser le conteneur qui porte le libellé lit alors
  l'avertissement au lieu du montant. Les assertions de montant s'ancrent sur
  le libellé **exact** et lisent l'élément voisin.
- **Changer le fragment d'URL ne suffit pas juste après une connexion.**
  `LoginPage` émet son propre `navigate('/')` un instant après le PIN ; un
  `page.goto('/#/superadmin')` lancé avant se fait écraser sans bruit et le
  test regarde le tableau de bord. Passer par `about:blank` force un vrai
  chargement de document.
- **Le refus d'une règle ne se dit pas pareil partout.** La production répond
  « Missing or insufficient permissions. », l'émulateur renvoie la règle qui a
  refusé (« Property superadmin is undefined on object … @ L400 »). Un message
  destiné à l'utilisateur doit donc s'appuyer sur le **code** d'erreur, jamais
  sur le texte.
- **Le séparateur de milliers n'est pas une espace ordinaire.** Selon la
  version d'ICU, `Intl` produit U+202F ou U+00A0 pour `fr-FR`. Les assertions
  passent par une expression régulière tolérante, avec une contre-vérification
  arrière pour que « 5 000 FCFA » ne corresponde pas à l'intérieur de
  « 15 000 FCFA ».

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
