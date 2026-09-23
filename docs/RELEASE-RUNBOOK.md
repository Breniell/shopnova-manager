# Publier une version de Legwan

Ce document décrit la procédure **réellement suivie** aujourd'hui, celle des
versions 1.8.0 à 1.12.0. Il décrivait auparavant une publication signée par la
CI : ce chemin existe toujours dans le dépôt, mais il ne peut pas s'exécuter
faute de certificat, et aucune version n'est passée par lui.

---

## L'état des lieux, en une phrase

**Les versions sont construites et publiées à la main, non signées.** Le
propriétaire n'a pas de certificat Authenticode, et c'est une décision assumée,
pas un oubli (voir `docs/FAUX-POSITIF-ANTIVIRUS.md` pour les conséquences et
les parades gratuites).

Conséquence à connaître : `npm run release:client` **échoue volontairement**
sans certificat, et le workflow `Release (tag v*)` s'arrête proprement pour la
même raison. Ne pas essayer de « réparer » ces échecs en désactivant les
contrôles de signature.

---

## 1. Contrôles avant publication

Tous doivent passer. Les deux suites longues se lancent **l'une après
l'autre** : ensemble elles saturent la machine et l'émulateur Firestore ne
démarre pas dans son délai.

```powershell
npm run lint
npm run typecheck
npm run security:prod          # échoue seulement sur une faille « high »
npm test                       # tests unitaires
npm run test:electron-runtime  # processus principal Electron
npx playwright test --config playwright.flows.config.ts   # parcours metier
```

Un correctif de comportement doit en plus être **vérifié par mutation** :
casser volontairement la règle qu'il protège, constater que le test tombe au
bon endroit, puis remettre le code en état et vérifier que `git diff src/` est
vide. Un test incapable d'échouer ne protège rien — c'est ainsi que
l'autorisation gérant est restée morte cinq versions.

## 2. Numéro de version

```
package.json  →  "version": "1.12.0"
```

**Modifier ce fichier avec un éditeur, jamais par PowerShell.**
`Set-Content -Encoding utf8` y ajoute un BOM qui casse `JSON.parse` dans
`vite.config.ts`. Vérifier après coup :

```powershell
[System.IO.File]::ReadAllBytes("package.json")[0..2]   # 7B 0A 20 attendu, pas EF BB BF
(Get-Content package.json -Raw | ConvertFrom-Json).version
```

Puis commiter et pousser avant de construire.

## 3. Construction

```powershell
npm run dist:client
```

Le script enchaîne le build Vite (variante CLIENT, sans console super-admin),
l'empaquetage NSIS, puis `scripts/verify-release.mjs`, qui refuse la livraison
si un module est présent mais **injoignable** depuis `app.asar.unpacked`, si un
marqueur d'émulateur traîne dans l'archive, ou si `latest.yml` ne correspond
pas à l'installeur.

## 4. Vérifications sur le paquet produit

Ne pas se fier au message de succès. Contrôler trois choses :

```powershell
# a. L'empreinte du fichier correspond au checksum publie
$f = Get-Item "release\Legwan-Setup-<version>.exe"
(Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()
Get-Content "release\SHA256SUMS.txt"

# b. Aucune fuite dans le paquet client
Select-String -Path "dist\assets\*.js" -List `
  -Pattern "Console Super-Admin|superadmin@legwan.test|breniellkouda|Firebase emulators active"
# -> doit ne rien renvoyer

# c. La fonctionnalite annoncee est reellement dedans
Select-String -Path "dist\assets\*.js" -List -Pattern "<un libelle de la nouveaute>"
```

Le point b a déjà servi : `.env.emulator` active `VITE_ENABLE_SUPERADMIN` pour
les tests, et seule la surcharge en ligne de commande empêche la console
d'atterrir chez les commerçants.

## 5. Publication

Les notes sont rédigées **pour des commerçants**, pas pour des développeurs :
ce que le défaut provoquait chez eux, ce qui change à l'écran, ce qu'ils ont à
faire. Y joindre l'empreinte SHA-256 du fichier réellement construit.

```powershell
gh release create v<version> `
  --title "Legwan <version> - <ce que ça change, en clair>" `
  --notes-file <notes.md> `
  "release\Legwan-Setup-<version>.exe" `
  "release\Legwan-Setup-<version>.exe.blockmap" `
  "release\latest.yml" `
  "release\SHA256SUMS.txt"
```

Les **quatre** fichiers sont nécessaires : sans `latest.yml`, aucun poste
installé ne voit la mise à jour.

## 6. Vérification après publication

```powershell
$r = gh release view v<version> --json tagName,isDraft,assets | ConvertFrom-Json
$r.assets | ForEach-Object { "$($_.name) $($_.size) $($_.state)" }

# Ce que les postes installes vont reellement lire :
[System.Text.Encoding]::UTF8.GetString(
  (Invoke-WebRequest "https://github.com/Breniell/shopnova-manager/releases/latest/download/latest.yml" -UseBasicParsing).Content)
```

La taille annoncée dans `latest.yml` doit être identique à celle du fichier
construit.

---

## Déployer les règles Firestore

Séparé de la publication, et **nécessaire dès qu'une fonctionnalité en dépend**
(l'ancre d'essai de la 1.12.0, par exemple). Sans ce déploiement, la
fonctionnalité échoue silencieusement chez les clients.

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "D:\Shopnova\shopnova-manager\service-account.json"
node scripts/deploy-firestore-rules.mjs --project=legwan-82a09
```

**Appeler `node` directement.** `npm run firestore:deploy-rules -- --project=…`
avale l'argument et le script s'arrête sur « Missing --project ».

Vérifier ensuite ce qui est réellement servi en production — le message de
succès ne suffit pas : lire la release `cloud.firestore` via l'API
`firebaserules.googleapis.com` et comparer le contenu au fichier du dépôt.

L'émulateur charge ce même `firestore.rules` : si `npm run e2e:flows` passe, la
syntaxe est déjà validée.

---

## Sauvegardes automatiques et diagnostics

L'application crée au plus une sauvegarde complète par jour et conserve les 14
plus récentes. Une sauvegarde forcée est exigée juste avant l'installation
explicite d'une mise à jour ; en cas d'échec, l'installation est bloquée.

Ce sont des sauvegardes JSON importables depuis les paramètres, dans le profil
utilisateur Electron sous `automatic-backups`. Menu **Legwan > Sauvegardes
automatiques** pour ouvrir le dossier.

Les journaux sont tournants et masquent jetons, clés, mots de passe et PIN.
Menu **Legwan > Diagnostics locaux**. Ne pas les publier sans relecture.

## Déploiement progressif

1. Conserver hors ligne l'installeur de la version précédente et son empreinte.
2. Publier d'abord pour une boutique pilote.
3. Vérifier ouverture en ligne et hors ligne, synchronisation, impression,
   restauration d'une sauvegarde.
4. Étendre par petits groupes après validation du pilote.

## Retour arrière contrôlé

Electron-updater ne doit **pas** servir à forcer une baisse de version.

1. Retirer la release fautive des releases GitHub (ou la passer en brouillon) ;
2. quitter Legwan et copier `automatic-backups` sur un support séparé ;
3. vérifier l'empreinte du dernier installeur stable conservé ;
4. désinstaller la version fautive **sans** effacer le profil utilisateur ;
5. réinstaller la version stable et refaire la recette hors ligne ;
6. si les données ne sont plus compatibles, restaurer la sauvegarde
   `pre-update` via **Paramètres > Sauvegarde** ;
7. publier ensuite un correctif avec un numéro **supérieur** pour rétablir le
   canal de mise à jour.

Une migration destructive de schéma doit fournir sa migration inverse avant
publication. La sauvegarde pré-update protège les données, elle ne rend pas un
ancien binaire compatible avec un nouveau schéma.

---

## Si un certificat est acquis un jour

Le chemin signé est prêt et n'a pas été démonté. Renseigner les secrets GitHub
`WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, `WIN_CSC_PUBLISHER`, `WIN_CSC_SUBJECT`
ainsi que les sept variables Firebase et `VITE_LICENSE_PUBKEY` : le workflow
`Release (tag v*)` reprend alors la main tout seul sur le tag.

Il **complète** une release déjà créée à la main, sans en réécrire le titre ni
les notes.

Ne jamais ajouter au dépôt un PFX, une clé privée, `.env` ou
`service-account.json`.
