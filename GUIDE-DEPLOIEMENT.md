# Guide de déploiement Legwan v1.3

Ce guide te conduit pas à pas de **« j'ai le code source »** à **« mes commerçants utilisent l'app en production »**.

---

## 📋 Sommaire

1. [Vérifications avant déploiement](#1-vérifications-avant-déploiement)
2. [Configuration Firebase](#2-configuration-firebase)
3. [Configuration locale du projet](#3-configuration-locale-du-projet)
4. [Tests en local](#4-tests-en-local)
5. [Options de déploiement](#5-options-de-déploiement)
6. [Déploiement Web — Firebase Hosting (recommandé)](#6-déploiement-web--firebase-hosting-recommandé)
7. [Déploiement Web — Vercel (alternative)](#7-déploiement-web--vercel-alternative)
8. [Déploiement Desktop — Electron Windows/Mac/Linux](#8-déploiement-desktop--electron)
9. [Premier démarrage en boutique](#9-premier-démarrage-en-boutique)
10. [Backup & restauration](#10-backup--restauration)
11. [Monitoring & support après lancement](#11-monitoring--support)
12. [Checklist Go-Live](#12-checklist-go-live)

---

## 1. Vérifications avant déploiement

### Prérequis sur ta machine

| Outil | Version min. | Commande de vérification |
|---|---|---|
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| Git | n'importe | `git --version` |
| Firebase CLI | dernière | `firebase --version` |

Si Firebase CLI n'est pas installé :
```bash
npm install -g firebase-tools
```

### État de validation du code (au moment du livrable v1.3)

| Vérification | Résultat |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erreur |
| `npx eslint src` | ✅ 0 erreur (14 warnings non bloquants sur `useMemo`) |
| `npx vite build` | ✅ succès, PWA généré, **2.4 MB** au total |
| `npx vitest run` | ✅ **441 / 441** tests passent |

### Taille du projet (pour info)

- **20 825** lignes de TypeScript/TSX dans `src/`
- **13** stores Zustand
- **17** pages
- **64** composants UI réutilisables
- **31** fichiers de tests

---

## 2. Configuration Firebase

Firebase est utilisé pour le stockage des données (Firestore) et l'authentification (anonyme par boutique).

### 2.1 Créer un projet Firebase

1. Va sur **https://console.firebase.google.com**
2. Clique **"Ajouter un projet"**
3. Nom suggéré : `legwan-prod` (ou `legwan-pilote` pour le pilote)
4. **Désactiver Google Analytics** (inutile pour Legwan, simplifie la conformité)
5. Clique **"Créer le projet"** — attendre 30s

### 2.2 Activer Firestore

1. Menu gauche → **Build** → **Firestore Database**
2. Clique **"Créer une base de données"**
3. Mode : **"Production"** (les règles de sécurité protègent les données)
4. Région : **`europe-west3` (Frankfurt)** ou **`europe-west6` (Zurich)** — bonne latence depuis l'Afrique de l'Ouest et zone CEMAC

### 2.3 Déployer les règles de sécurité Firestore

Les règles de sécurité sont **critiques** : sans elles, n'importe qui peut lire/écrire toutes les données.

Depuis ton dossier `legwan-v1.1/` :
```bash
firebase login
firebase use --add        # Choisis le projet créé à l'étape 2.1
firebase deploy --only firestore:rules
```

Tu devrais voir :
```
✔  cloud.firestore: rules file firestore.rules compiled successfully
✔  firestore: released rules firestore.rules to cloud.firestore
✔  Deploy complete!
```

### 2.4 Activer l'authentification anonyme

1. Menu gauche → **Build** → **Authentication**
2. Onglet **"Sign-in method"**
3. Activer **"Anonymous"** → Activer → Enregistrer

> **Pourquoi anonyme ?** Chaque boutique reçoit un UID Firebase unique à son premier lancement. Les règles Firestore limitent l'accès des données aux documents dont le path correspond à cet UID. C'est plus simple qu'un système email/password et 100% sécurisé : aucune boutique ne peut lire les données d'une autre.

### 2.5 Récupérer la configuration Web

1. **Project Settings** (engrenage en haut à gauche) → **Project settings**
2. Onglet **"General"** → descendre jusqu'à **"Your apps"**
3. Si aucune app Web : cliquer l'icône **`</>`** (Web)
4. Nom suggéré : `legwan-web`
5. **Décocher "Also set up Firebase Hosting"** (on s'en occupera plus tard si tu choisis cette option)
6. Clique **"Register app"**
7. **Copie les valeurs** dans l'objet `firebaseConfig` qui s'affiche

### 2.6 Configurer le compte super-admin (développeur uniquement)

Le tableau de bord super-admin permet de surveiller toutes les boutiques enregistrées.
Il est **exclu du bundle commerçant** par défaut — les marchands ne peuvent pas y accéder même en naviguant vers `/superadmin`.

#### a) Compte dédié

Crée un compte Firebase Auth **Email/Password** dédié à l'administration (ex. `admin-legwan@ton-domaine.com`).
Ne réutilise **jamais** ton compte personnel et n'utilise jamais le même compte pour les boutiques.

#### b) Attribuer le custom claim

```bash
# Installer firebase-admin (une seule fois)
npm install --save-dev firebase-admin

# Télécharger la clé de service depuis Firebase Console →
# Project settings → Service accounts → Generate new private key
# Sauvegarder sous service-account.json à la racine du projet (jamais commité)

# Attribuer le claim
node scripts/set-superadmin-claim.mjs set admin-legwan@ton-domaine.com

# Le compte doit se déconnecter / reconnecter pour que le claim soit effectif.

# Pour révoquer plus tard :
node scripts/set-superadmin-claim.mjs revoke admin-legwan@ton-domaine.com
```

> **Rotation des clés** : Si la clé `service-account.json` est compromise (exposée sur GitHub, etc.),
> va dans Firebase Console → Service accounts → **supprimer la clé exposée** et en générer une nouvelle.
> Le claim existant reste valide — seule la clé de service est invalidée.

#### c) Build super-admin

Pour un déploiement qui inclut l'interface super-admin, définis ces variables dans `.env` :

```env
VITE_ENABLE_SUPERADMIN=true
VITE_SUPERADMIN_EMAIL=admin-legwan@ton-domaine.com
```

Les builds commerçants **ne définissent pas ces variables** (ou laissent `VITE_ENABLE_SUPERADMIN=false`).
Vite élimine tout le code super-admin à la compilation : aucun octet du tableau de bord n'est livré aux commerçants.

---

## 3. Configuration locale du projet

### 3.1 Décompresser et installer

```bash
# Décompresser le zip livré
unzip legwan-v1.3-inventaire.zip
cd legwan-v1.1

# Installer les dépendances
npm install
```

> Si `npm install` rate sur Windows à cause d'Electron, utilise `npm install --ignore-scripts` puis `npx electron-builder install-app-deps` quand tu veux compiler le desktop.

### 3.2 Créer le fichier `.env`

Copie `.env.example` en `.env` :
```bash
cp .env.example .env
```

Édite `.env` avec les valeurs de l'étape 2.5 :
```env
VITE_FIREBASE_API_KEY=AIzaSyD...........................
VITE_FIREBASE_AUTH_DOMAIN=legwan-prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=legwan-prod
VITE_FIREBASE_STORAGE_BUCKET=legwan-prod.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

> ⚠️ **Ne commit JAMAIS le fichier `.env`** sur GitHub. Il est déjà dans `.gitignore`.

---

## 4. Tests en local

Avant de déployer, lance Legwan sur ta machine pour vérifier que tout fonctionne :

```bash
# Lancer le serveur de développement
npm run dev
```

Ouvrir **http://localhost:8080** (port par défaut Vite).

### Premier scénario à tester

1. **Création de la boutique** : à la première connexion, l'app initialise automatiquement une boutique Firebase
2. **Créer un produit** : Produits → "Ajouter un produit" → Coca 33cl, prix achat 250, vente 500, stock 20
3. **Faire une vente** : Caisse → cliquer le produit → mode "Espèces" → valider
4. **Vérifier dans la console Firebase** : `boutiques/{uid}/sales` doit contenir un document

### Lancer les tests automatisés

```bash
npm test                 # mode watch
npx vitest run           # une seule passe
npx vitest run --coverage  # avec rapport de couverture
```

Tu devrais voir **441 / 441 tests passent** en moins de 40s.

---

## 5. Options de déploiement

Tu as **trois options** selon ton public cible :

| Option | Cible | Coût | Difficulté | Recommandé pour |
|---|---|---|---|---|
| **A. Firebase Hosting** | Web (PWA installable) | Gratuit (10 GB) | ⭐ Facile | Boutiques avec Wi-Fi/4G, app sur tablette/smartphone |
| **B. Vercel** | Web (PWA installable) | Gratuit | ⭐⭐ Facile | Si tu préfères l'écosystème Vercel |
| **C. Electron Desktop** | Windows / Mac / Linux | Gratuit (auto-distribué) | ⭐⭐⭐ Moyen | Boutiques avec PC fixe, fonctionnement offline-first |

**Mon conseil pour le pilote** : commence par **A (Firebase Hosting)**. Le PWA s'installe en 1 clic sur n'importe quel device, marche offline grâce au Service Worker, et tu as les mises à jour automatiques. Tu pourras toujours faire du desktop Electron plus tard si certaines boutiques en demandent.

---

## 6. Déploiement Web — Firebase Hosting (recommandé)

### 6.1 Initialiser Firebase Hosting

Dans le dossier `legwan-v1.1/` :
```bash
firebase init hosting
```

Réponses aux questions :
- **What do you want to use as your public directory?** → `dist`
- **Configure as a single-page app?** → `Yes`
- **Set up automatic builds and deploys with GitHub?** → `No` (on le fera manuellement)
- **File dist/index.html already exists. Overwrite?** → `No`

Cela crée un fichier `firebase.json`. Vérifie qu'il contient :
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

### 6.2 Configurer le cache du Service Worker

Ajoute dans `firebase.json` (à côté de `rewrites`) pour que les mises à jour soient prises en compte rapidement :
```json
"headers": [
  { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
  { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
]
```

### 6.3 Builder et déployer

```bash
npm run build                       # génère dist/
firebase deploy --only hosting
```

Tu verras :
```
✔  hosting: file upload complete (35 files)
✔  hosting: version finalized
✔  hosting[legwan-prod]: release complete

Hosting URL: https://legwan-prod.web.app
```

🎉 **Legwan est en ligne !** Ouvre l'URL — l'app charge en quelques secondes.

### 6.4 Configurer un domaine personnalisé (optionnel)

Si tu veux `app.legwan.cm` au lieu de `legwan-prod.web.app` :
1. Firebase Console → Hosting → **Add custom domain**
2. Suis les instructions pour ajouter le CNAME chez ton registrar de domaine
3. SSL configuré automatiquement en ~24h

### 6.5 Installation PWA sur appareil

Sur Chrome/Edge mobile ou desktop :
- L'app propose automatiquement **"Installer Legwan"** au bout de quelques secondes
- Une fois installée, elle apparaît dans le launcher comme une vraie app
- Marche offline (cache du Service Worker + cache Firestore IndexedDB)

---

## 7. Déploiement Web — Vercel (alternative)

Si tu préfères Vercel :

```bash
npm install -g vercel
vercel login
vercel             # première fois : suis les instructions, projet Vite détecté auto
vercel --prod      # déploiement production
```

Variables d'environnement : à ajouter dans Vercel Dashboard → Project → Settings → Environment Variables (mêmes `VITE_FIREBASE_*` que ton `.env`).

> Vercel fonctionne mais perd un peu l'intégration avec Firebase. Firebase Hosting reste préférable si tu utilises déjà Firestore.

---

## 8. Déploiement Desktop — Electron (deux variantes)

Le projet produit **deux installeurs Windows distincts** à partir du même code source :

| Variante | Contenu | Destinataire | Fichier produit |
|---|---|---|---|
| **CLIENT** | App complète — console super-admin **absente** du bundle | Commerçants | `Legwan-Setup-x.y.z.exe` |
| **ÉDITEUR** | App complète — console super-admin **incluse** | Toi (éditeur) | `Legwan-Admin-Setup-x.y.z.exe` |

Les deux installeurs coexistent sur la même machine sans conflit (IDs Windows différents, répertoires d'installation séparés).

---

### 8.1 Installeur CLIENT — à distribuer aux commerçants

```bash
npm run dist:client
```

Ce que fait cette commande :
1. Vite build avec `VITE_ENABLE_SUPERADMIN=false` → bundle sans aucun octet de super-admin
2. electron-builder avec `electron-builder.yml` → produit `release/Legwan-Setup-x.y.z.exe`

**Vérification après build** — zéro trace de super-admin dans le bundle :
```bash
# Doit retourner 0 résultat
grep -r "superadmin" dist/assets/
```

---

### 8.2 Installeur ÉDITEUR — pour ta machine uniquement

```bash
npm run dist:admin
```

Ce que fait cette commande :
1. Vite build avec `VITE_ENABLE_SUPERADMIN=true` + `VITE_SUPERADMIN_EMAIL` issu de `.env`
2. electron-builder avec `electron-builder.admin.yml` → produit `release/Legwan-Admin-Setup-x.y.z.exe`

**Installation sur ta machine :**
- Double-cliquer `release/Legwan-Admin-Setup-x.y.z.exe`
- L'app s'installe dans `%LOCALAPPDATA%\Programs\Legwan Admin`
- Un raccourci **"Legwan Admin"** apparaît sur le bureau et dans le menu Démarrer
- Ouvrir l'app normalement (double-clic) — la console super-admin est accessible via `Ctrl+Shift+Alt+A`

> L'installeur ÉDITEUR ne touche pas à l'installation CLIENT existante — IDs Windows et répertoires distincts.

---

### 8.3 Prérequis communs aux deux builds

Avant de lancer `dist:client` ou `dist:admin` :

1. `.env` présent et complet (Firebase vars + `VITE_SUPERADMIN_EMAIL` pour la variante admin)
2. `build/icon.ico` présent (256×256 ou 512×512)
3. `build/LICENSE.rtf` présent (affiché dans le wizard NSIS)

Le script vérifie ces prérequis et s'arrête avec un message clair si quelque chose manque.

---

### 8.4 Builds web uniquement (sans Electron)

Pour un déploiement web (Firebase Hosting, Vercel) :

```bash
npm run build:client    # bundle sans super-admin → dist/
npm run build:admin     # bundle avec super-admin → dist/
```

---

### 8.5 Sécurité — exclusions des installeurs

Les fichiers suivants sont **explicitement exclus** des deux installeurs
(configuré dans `files` de chaque `electron-builder*.yml`) :

- `scripts/` (dont `scripts/license-gen/`) — outils CLI éditeur uniquement
- `*.pem`, `*.key` — clés de signature éventuelles
- `service-account*.json` — clé Firebase Admin
- `.env`, `.env.*` — variables d'environnement locales

---

### 8.6 Signature de code (optionnel)

Sans signature, Windows affiche un avertissement SmartScreen. Pour le pilote c'est acceptable
(cliquer "Plus d'infos" → "Exécuter quand même"). Pour la production large :
- Certificat EV Windows (~300 €/an chez Sectigo ou DigiCert) — supprime SmartScreen instantanément
- OV classique (~70 €/an) — réduit les faux positifs mais ne supprime pas SmartScreen

---

### 8.7 Génération des licences (opération éditeur, séparée de l'app)

La **signature des clés de licence** est une opération en ligne de commande, indépendante
de l'app installée. Elle se fait sur ta machine uniquement, dans le terminal :

```bash
node scripts/license-gen/generate.mjs
```

Cet outil n'est jamais packagé dans les installeurs (exclu via `!scripts/**/*`).
L'app installée (CLIENT ou ÉDITEUR) valide les licences — elle ne peut pas en générer.

---

## 9. Premier démarrage en boutique

Sur l'appareil de la boutique pilote :

### 9.1 Installation

- **Web (PWA)** : ouvrir l'URL Firebase dans Chrome → installer le PWA
- **Desktop** : exécuter l'installeur `.exe` ou `.dmg`

### 9.2 Configuration initiale (rôle gérant)

1. **Premier écran** : l'app crée automatiquement une boutique Firebase anonyme
2. Aller dans **Paramètres** :
   - Nom de la boutique
   - Adresse, téléphone (apparaissent sur le reçu)
   - Logo (optionnel)
   - Devise FCFA par défaut
3. Aller dans **Paramètres → Utilisateurs** :
   - Le compte gérant initial est créé (rôle gérant, PIN à 4 chiffres)
   - Ajouter les caissiers (rôle caissier, PIN distinct chacun)

### 9.3 Saisie du catalogue

- **Produits** : créer la liste des produits avec prix d'achat, vente, stock initial
- Si le catalogue est grand (>100 produits), utiliser un script CSV (à demander en feature future)

### 9.4 Saisie des clients récurrents

- **Clients** : ajouter les clients réguliers avec leur téléphone et leur **plafond de crédit** si applicable

### 9.5 Première session de caisse

- Le caissier se connecte → redirection automatique vers **"Ouverture de session"**
- Saisir le fond de caisse initial (espèces présentes dans le tiroir)
- Démarrer la session → la caisse est utilisable

---

## 10. Backup & restauration

### 10.1 Backup automatique Firestore

Firebase Spark (gratuit) ne fait **pas** de backup automatique. Deux options :

**Option A — Backup manuel via Firebase CLI** (à scripter)
```bash
# Activer l'API Firestore Admin dans GCP Console
gcloud firestore export gs://legwan-prod-backups
```
Configurer un cron job (sur ton serveur) qui exécute ça **chaque nuit**.

**Option B — Upgrader au plan Blaze + scheduled exports**
Dans Firestore → Backups → Scheduled backups. ~0.18 $/GB/mois.

Pour une boutique pilote, **Option A scriptée** suffit. Pour la prod multi-boutiques, **Option B** est obligatoire.

### 10.2 Export manuel pour le commerçant

Dans Legwan :
- **Ventes** → bouton "Exporter CSV"
- **Dépenses** → bouton "Exporter CSV"

Ces exports peuvent être ouverts dans Excel pour archive comptable.

### 10.3 Restauration

En cas de besoin (rare) :
```bash
gcloud firestore import gs://legwan-prod-backups/<date>
```
⚠️ Cela **écrase** la base actuelle. Faire un backup juste avant pour pouvoir revenir en arrière en cas d'erreur.

---

## 11. Monitoring & support

### 11.1 Console Firebase

- **Firestore → Usage** : nombre de lectures/écritures par jour (limite gratuite : 50k reads / 20k writes par jour)
- **Authentication → Users** : voir le nombre de boutiques actives
- **Crashlytics** (à activer si voulu) : remontée automatique des crashs

### 11.2 Logs côté code

L'app utilise `console.error()` pour les erreurs non bloquantes (sync Firestore qui rate, etc.). Pour la production, brancher un service de monitoring :

**Sentry (recommandé, gratuit jusqu'à 5k events/mois)** :
```bash
npm install @sentry/react
```
Puis dans `src/main.tsx`, ajouter :
```ts
import * as Sentry from '@sentry/react';
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
});
```

### 11.3 Support utilisateur

Mets en place un canal de support :
- **WhatsApp** pro pour les questions des pilotes (le plus simple au Cameroun)
- Un Google Sheet pour tracker les bugs/demandes
- Une page FAQ dans Legwan (à ajouter en v1.4 si pertinent)

---

## 12. Checklist Go-Live

Avant de mettre une boutique en production réelle (pas un test) :

### Technique
- [ ] Firebase project créé, Firestore activé en région européenne
- [ ] **Firestore rules déployées** (`firebase deploy --only firestore:rules`)
- [ ] Auth anonyme activée
- [ ] App déployée et accessible via URL
- [ ] PWA installable (test sur smartphone)
- [ ] Test offline : couper Wi-Fi, faire une vente, rallumer → synchro OK
- [ ] Backup configuré (manuel ou automatique)
- [ ] Sentry / monitoring activé (si en prod réelle)
- [ ] **Installeur CLIENT** généré via `npm run dist:client` → `release/Legwan-Setup-x.y.z.exe`
- [ ] **Vérification bundle client** : `grep -r "superadmin" dist/assets/` → 0 résultat
- [ ] **Installeur ÉDITEUR** généré via `npm run dist:admin` → `release/Legwan-Admin-Setup-x.y.z.exe`
- [ ] **Installeur ÉDITEUR installé sur ta machine** — raccourci "Legwan Admin" sur le bureau
- [ ] Custom claim `superadmin: true` attribué uniquement au compte admin dédié (pas un compte perso)
- [ ] `service-account.json` absent du dépôt git (`git ls-files service-account*.json` → vide)
- [ ] Vérifier que `scripts/license-gen/` **ne figure pas** dans l'installeur (`npm run dist:client` puis inspecter `release/`)

### Métier (boutique pilote)
- [ ] Catalogue complet saisi (au moins 80% des produits)
- [ ] Stocks initiaux corrects
- [ ] Clients réguliers ajoutés avec plafonds crédit
- [ ] Comptes caissiers créés avec PIN
- [ ] Logo et infos boutique configurés dans Paramètres
- [ ] Reçu personnalisé testé (impression ou affichage)

### Formation
- [ ] Gérant formé sur : Caisse, Crédit, Dépenses, Clôture, Rapports
- [ ] Caissier(s) formé(s) sur : Caisse, Ouverture session, Clôture session
- [ ] Note papier laissée sur les 5 manipulations clés
- [ ] Numéro WhatsApp de support communiqué

### Légal (selon contexte)
- [ ] CGU / mentions légales (si publication grand public)
- [ ] Conformité RGPD-équivalent CEMAC (loi camerounaise n° 2010/012 sur la cybersécurité et la cybercriminalité)
- [ ] Convention de service avec la boutique pilote (gratuit ou abonnement)

---

## 🎯 Plan de pilote sur 4-6 semaines

| Semaine | Action |
|---|---|
| **S1** | Déploiement, formation, saisie catalogue, premières ventes |
| **S2** | Usage quotidien, premier bilan (1h call) — corriger les blocages immédiats |
| **S3-4** | Usage stabilisé, collecter les remarques utilisateurs |
| **S5** | Faire un point complet : ce qui marche, ce qui manque, ce qui frustre |
| **S6** | Décider la suite : Phase 2 ? autre vertical ? élargir le pilote ? |

**3 boutiques pilotes maximum** au début. Mieux qu'1 (compare des usages) mais pas 10 (impossible de tracer les bugs). Idéalement, 3 contextes différents : alimentation, vêtements, quincaillerie.

---

## 🆘 Problèmes courants & solutions

### « L'app charge à blanc »
- F12 → onglet Console → erreurs JavaScript ?
- Vérifier que les variables `VITE_FIREBASE_*` sont bien définies
- Vérifier que les rules Firestore sont déployées

### « Permission denied » en Firestore
- Les rules Firestore ne sont pas déployées
- Lancer : `firebase deploy --only firestore:rules`

### « L'app ne synchronise pas en mode offline »
- Firefox a parfois des soucis avec IndexedDB → tester sur Chrome
- Vérifier dans DevTools → Application → IndexedDB → des entrées existent

### « Le PIN gérant ne fonctionne pas »
- Le PIN initial est défini par le gérant lui-même au premier setup
- Pas de "PIN par défaut", c'est par sécurité
- En cas d'oubli total : supprimer la collection `users` dans Firestore et redémarrer l'app

### « Le PWA ne s'installe pas »
- Doit être servi en HTTPS (Firebase Hosting le fait automatiquement)
- Sur localhost, ça marche aussi
- Sur Safari iOS, l'installation est via "Partager → Sur l'écran d'accueil"

---

## 🔧 Migration v1.5 — Nettoyage registre (Ticket 8)

À partir de la **version 1.5**, le registre super-admin n'enregistre plus de données financières dans les documents Firestore (champ `stats` supprimé). Seul le bloc `health` est désormais écrit.

### Pourquoi migrer ?

Les anciens documents dans `registry/` contiennent encore un champ `stats` avec des données agrégées (CA, nombre de ventes, produits…). Ces données sont **obsolètes** dès que chaque boutique envoie son premier heartbeat v1.5, mais le champ reste présent jusqu'à ce qu'il soit explicitement supprimé.

### Comment migrer

1. **Télécharger** une clé de compte de service Firebase :
   - Firebase Console → Paramètres du projet → Comptes de service → Générer une nouvelle clé privée
   - Sauvegarder dans `serviceAccountKey.json` (ne pas committer)

2. **Installer firebase-admin** (si pas déjà installé) :
   ```bash
   npm install firebase-admin
   ```

3. **Test à blanc** (prévisualisation sans écriture) :
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrate-registry.mjs --dry-run
   ```

4. **Exécuter la migration** :
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrate-registry.mjs
   ```

5. Vérifier dans Firebase Console → Firestore → `registry` que les documents ne contiennent plus de champ `stats`.

> **Note :** La migration est idempotente — la ré-exécuter sur des documents déjà migrés est sans effet.

---

## 🎁 Bonus : commandes utiles

```bash
# Mettre à jour Legwan en production
git pull origin main           # récupérer les changements
npm install                    # nouvelles dépendances éventuelles
npm run build                  # build de production
firebase deploy --only hosting # déployer

# Voir les logs Firebase en live
firebase emulators:start

# Tester localement avec l'émulateur Firestore
firebase emulators:start --only firestore

# Supprimer toutes les données d'une boutique (DANGER, irréversible)
# → Firebase Console → Firestore → boutiques → cliquer la boutique → supprimer
```

---

## 📞 Et après ?

Si tout va bien après 4-6 semaines de pilote :
- **Phase 2** : TVA, audit log, transactions atomiques, bons de commande fournisseur
- **Phase 3** : multi-boutique avec siège, programme de fidélité, e-commerce léger
- **Phase 4** : marketplace, paiements en ligne, banking partner

Si certaines fonctionnalités ne sont pas utilisées : ne pas les industrialiser. Si certaines sont utilisées intensément : prioriser leur amélioration.

**Le pilote, c'est la vraie spec.** Tout ce qu'on a codé en Phase 1 est une hypothèse — c'est l'usage réel qui la valide ou l'invalide.

🚀 Bonne route avec Legwan.
