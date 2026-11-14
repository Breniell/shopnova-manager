# Audit de sécurité Legwan — novembre 2026

Version auditée : 1.14.2 (`main`, commit 311da42).
Périmètre : règles Firestore, processus Electron (main, preload, IPC, fenêtres),
authentification (PIN, compte de récupération, super-admin), licence et horloge,
injection HTML/CSV, sauvegardes, secrets, dépendances.

Méthode : revue du code, puis tests d'attaque exécutables contre l'émulateur
Firestore (`npm run test:security-rules`), tests unitaires, smoke test Electron
hors-ligne.

---

## 1. Synthèse

| Gravité | Trouvés | Corrigés | Restent (architecture / décision produit) |
|---|---|---|---|
| Élevée | 2 | 2 | — |
| Moyenne | 4 | 4 | 2 (identité partagée des postes, PIN 4 chiffres) |
| Faible | 3 | 3 | 3 (essai gratuit, plafond par défaut, Electron 41) |

Socle déjà solide : isolation des boutiques, registres financiers immuables,
licence Ed25519, horloge de confiance, Electron bien cloisonné, secrets jamais
commités.

---

## 2. Écarts corrigés

### H1 — Un caissier pouvait s'accorder du crédit illimité
- **Attaque** : ouvrir la fiche d'un client (complice), relever ou effacer son
  `plafondCredit`, puis vendre à crédit sans limite.
- **Cause** : le champ restait modifiable dans `ClientsPage` pour le rôle
  caissier, et les règles laissaient le personnel écrire n'importe quel champ
  client.
- **Correctif** : champ désactivé pour les caissiers, et clé omise à
  l'enregistrement pour que la valeur actuelle soit conservée
  (`src/pages/ClientsPage.tsx`). Côté règles, le personnel ne peut ni poser, ni
  modifier, ni supprimer `plafondCredit` (`firestore.rules`, `customers`).
- **Preuve** : tests 11 à 13 (refusé avant le correctif, bloqué après).

### H2 — Un caissier pouvait gonfler le stock (masquer un vol)
- **Attaque** : `stock: increment(+50)` ou `stock: 999` sur un produit, avant
  un inventaire.
- **Correctif** : le personnel ne peut que **diminuer** le stock, ce qui couvre
  la vente. Le réassort, les corrections et les remboursements restent réservés
  au gérant.
- **Preuve** : tests 9 et 10.

### M1 — Compteur de tickets rembobinable, collection `meta` ouverte
- **Attaque** : remettre `meta/saleCounter` à 1 pour faire collisionner les
  numéros de reçus, ou écrire n'importe quel document dans `meta`.
- **Correctif** : le personnel ne peut qu'avancer `saleCounter`. Tous les
  autres documents `meta` sont réservés au gérant.
- **Preuve** : test 14.

### M2 — Injection HTML via le logo sur le ticket thermique
- **Attaque** : un logo `data:…" onerror="…` (synchronisé depuis Firestore)
  sortait de l'attribut `src` dans le HTML envoyé à l'imprimante.
- **Correctif** : le logo n'est imprimé que s'il s'agit d'une data URL raster
  base64 (`isSafeImageDataUrl`, `src/lib/thermalPrint.ts`). En plus, la
  fenêtre d'impression tourne sans JavaScript et ne peut ni naviguer ni ouvrir
  de fenêtre (`electron/main.mjs`).
- **Preuve** : `src/test/lib/thermalPrintSafety.test.ts`.

### M3 — Une licence signée sans `expiresAt` n'expirait jamais
- **Cause** : `now > undefined` vaut `false`.
- **Correctif** : contrôle du format après la vérification de signature
  (`boutiqueId` non vide, `expiresAt` numérique fini) dans
  `src/lib/license/verify.ts`.
- **Preuve** : 3 tests ajoutés dans `src/test/lib/license.test.ts`.

### M4 — Mot de passe du compte de récupération : 6 caractères
- Ce compte se connecte avec l'UID propriétaire, donc avec un accès total aux
  données de la boutique.
- **Correctif** : 10 caractères minimum pour toute nouvelle liaison
  (`RECOVERY_PASSWORD_MIN_LENGTH`). Les comptes existants continuent de se
  connecter sans changement.

### L1 — Le registre super-admin servait de stockage libre
- **Correctif** : 25 champs maximum par entrée (`registry`). Test 6.

### L2 — Fenêtres popup `about:blank` sans verrou de navigation
- **Correctif** : les fenêtres enfants (impression d'étiquettes ou de
  rapports) ne peuvent plus naviguer, être redirigées, attacher une webview ni
  ouvrir d'autres fenêtres.

### L3 — Dépendances
- `npm audit fix` (sans changement de version majeure) : 39 → 25
  vulnérabilités. Les 2 critiques sont supprimées (`shell-quote`,
  `concurrently`), ainsi que `vite`, `undici`, `follow-redirects`, etc.

---

## 3. Résultats des tests d'attaque (`tests/security/firestore-rules.attack.test.mjs`)

24 scénarios : isolation entre boutiques, client non authentifié, usurpation
du registre, collections non déclarées ou imbriquées, caissier malveillant
(paramètres, comptes, dépenses, stock, crédit, compteur, ventes au nom d'un
collègue, suppression de ventes, réouverture de caisse, annulation de
paiement, déblocage d'un collègue verrouillé, licence), registres immuables
même pour le propriétaire, réinitialisation de l'essai, annulation d'une
révocation, horloge falsifiée. Des scénarios témoins vérifient que la vente
normale fonctionne toujours.

| Règles | Résultat |
|---|---|
| Avant (HEAD 311da42) | 19/24 — 4 attaques réussies (H1, H2, M1, L1), plus 1 échec par effet de bord |
| Après | **24/24** |

Autres vérifications : `typecheck` OK, `lint` 0 erreur, 750 tests unitaires OK,
23 tests runtime Electron OK, smoke test hors-ligne OK (4 fois d'affilée).

---

## 4. Risques résiduels — à décider (non corrigés)

1. **Identité Firebase partagée (moyen, architecture).** En pratique, chaque
   poste ouvre la session du **propriétaire** (UID anonyme). Les rôles
   caissier et gérant ne sont alors appliqués que côté application, par le
   PIN. Les règles « personnel » ne s'appliquent qu'aux postes provisionnés
   avec des *custom claims* (`npm run staff:claims`). Recommandation :
   provisionner une identité par employé, ou passer les opérations sensibles
   par des Cloud Functions.
2. **PIN à 4 chiffres (moyen).** PBKDF2 à 200 000 itérations ne compense pas
   10 000 combinaisons. Un hash lu sur le disque (localStorage) ou dans
   `users` se casse hors-ligne en quelques minutes. Recommandation : 6 chiffres
   minimum pour les comptes gérant.
3. **Essai gratuit renouvelable (faible).** Effacer le profil donne un nouvel
   UID anonyme, donc un nouvel essai. Recommandation : lier l'essai à un
   identifiant machine ou à un compte.
4. **Client créé sans plafond = crédit illimité (faible, produit).** Envisager
   un plafond par défaut à 0 pour les clients créés par un caissier.
5. **Electron 41 (faible en pratique).** Avis « high » corrigé seulement en
   45.x (version majeure). Impact limité ici, car seule la géolocalisation est
   autorisée et aucun gestionnaire HID/USB n'est enregistré. À planifier avec
   des tests de packaging. Même chose pour `zod` 3 → 4.
6. **`security:prod` donne un faux « 0 ».** `npm audit --omit=dev` ignore le
   code embarqué, car tout est en `devDependencies` et bundlé par Vite. Auditer
   sans `--omit=dev` ou déplacer les bibliothèques d'exécution dans
   `dependencies`.
7. **Hygiène locale.** `service-account.json` et `.env` (identifiants de
   production) sont à la racine du dépôt. Ils sont ignorés par git et absents
   de l'historique, mais il vaut mieux sortir la clé de service du dossier.

## 5. Points vérifiés conformes
- Electron : `contextIsolation`, `sandbox`, `nodeIntegration: false`,
  DevTools coupés en production, expéditeur IPC validé (URL et cadre
  principal), navigation et `window.open` filtrés, webviews interdites,
  permissions limitées à la géolocalisation, `openExternal` restreint à
  http(s)/mailto/tel.
- CSP de production injectée au build (`script-src 'self'`,
  `object-src 'none'`).
- Licence Ed25519 avec clé publique seule embarquée, horloge serveur via
  `request.time`, révocation non contournable.
- Exports : HTML échappé, injection de formules CSV neutralisée.
- Sauvegardes : AES-GCM-256 avec PBKDF2, somme de contrôle, validation zod à
  l'import.
- Secrets : jamais commités (historique git vérifié), clé privée de licence
  hors dépôt.

## 6. Déploiement
Les nouvelles règles ne protègent la production qu'une fois déployées :
`npm run firestore:deploy-rules`. Elles restent compatibles avec les clients
déjà installés : les sessions propriétaire ne sont pas touchées par les
nouvelles restrictions, qui ne visent que les identités « personnel ».
