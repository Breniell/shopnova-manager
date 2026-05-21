# Legwan v1.1 — Module Clients

**Date :** 16 mai 2026
**Module livré :** Clients (Étape 1/6 de la Phase 1 élargie)

---

## ✨ Nouveautés

### Page Clients (accessible depuis le menu)
- CRUD complet des fiches clients : prénom, nom, téléphone, email, adresse, notes, plafond de crédit
- Recherche instantanée par nom ou téléphone (insensible à la casse, normalisation des numéros)
- 4 KPI en haut de page : clients actifs, clients avec achats, CA généré, clients archivés
- **Archivage** plutôt que suppression : un client archivé garde son historique d'achats mais disparaît de la recherche
- Suppression définitive possible uniquement si aucune vente n'est liée (gérant uniquement)
- **Drawer "Détails client"** avec : coordonnées, statistiques (nb achats, total, panier moyen), notes, historique des 30 derniers achats cliquables
- Filtre "Voir les archivés" pour les gérants

### Sélecteur de client à la caisse (CustomerPicker)
- Bouton compact en haut du panier : `Aucun client sélectionné` → après sélection : nom du client
- Au clic, fiche déroulante avec recherche autocomplete (téléphone ou nom)
- Création rapide d'un client depuis la caisse (mini-modal nom + téléphone) → sélection automatique
- Pré-remplissage intelligent : si la recherche ressemble à un numéro, il est utilisé comme téléphone par défaut dans la création
- Bouton "Retirer le client" pour annuler la sélection

### Reçu enrichi
- Le nom du client apparaît sur le reçu si une vente est associée à un client identifié
- Affichage discret, juste après les infos du caissier

### Permissions
- **Gérant** : tout (créer, modifier, archiver, supprimer, voir archivés)
- **Caissier** : créer et modifier seulement (pas d'archive ni de suppression — préserve l'intégrité)

---

## 📁 Fichiers ajoutés

```
src/stores/useCustomerStore.ts              ← nouveau store Zustand
src/pages/ClientsPage.tsx                   ← page principale
src/components/ui/CustomerPicker.tsx        ← composant picker pour la caisse
src/test/stores/useCustomerStore.test.ts    ← 23 tests unitaires
```

## 📝 Fichiers modifiés

```
src/App.tsx                                 ← route /clients
src/lib/validations.ts                      ← customerSchema (Zod)
src/services/firestoreService.ts            ← fsLoadCustomers, fsSaveCustomer, fsDeleteCustomer + path Firestore
src/components/FirebaseProvider.tsx         ← bootstrap des customers au démarrage
src/components/layout/Sidebar.tsx           ← item de menu "Clients"
src/stores/useSaleStore.ts                  ← champs customerId et customerName (optionnels) sur Sale
src/pages/CaissePage.tsx                    ← intégration CustomerPicker + propagation du client à completeSale
src/components/ui/ReceiptModal.tsx          ← affichage du nom du client sur le reçu
```

---

## 🛡️ Compatibilité & migrations

**Aucune migration nécessaire.** Les ventes existantes restent valides — les champs `customerId` / `customerName` sont **optionnels** sur `Sale`. La nouvelle collection Firestore `customers` est créée vide au premier chargement, automatiquement.

**Rétro-compatibilité** : si tu fais un downgrade vers v1.0, les fiches clients seront simplement ignorées (Firestore les garde, elles seront accessibles à la prochaine montée de version).

---

## 🐛 Bugs corrigés au passage

**Bug d'IDs en collision** : lors de la création de plusieurs clients dans la même milliseconde (cas bulk import, scripts, tests), l'ID `'cust' + Date.now()` pouvait être identique entre plusieurs entités. Conséquence latente : `archiveCustomer(id)` pouvait archiver plusieurs clients à la fois. **Corrigé** en ajoutant un suffixe random à l'ID. Un test de régression a été ajouté.

> ⚠️ Note : `useSupplierStore.ts` et `useSaleStore.ts` (existants) ont le même pattern `Date.now()` et donc le même bug latent. À corriger dans une release future — non critique pour l'usage normal mais à surveiller.

---

## ✅ Validation

- **Type-check :** `npx tsc --noEmit -p tsconfig.app.json` → 0 erreur
- **Build de production :** `npx vite build` → succès, PWA généré
- **Tests unitaires :** `npx vitest run` → **266/266 passent** (23 nouveaux + 243 existants)

---

## 🧪 Checklist de tests manuels à effectuer

Avant de pousser en prod, lance l'app avec `npm run dev` et teste :

### Création / Modification
- [ ] Aller dans Clients → cliquer "Ajouter un client" → remplir → enregistrer → le client apparaît dans la liste
- [ ] Modifier un client existant → les modifs sont persistées (reload page)
- [ ] Tenter d'ajouter un client avec le même téléphone qu'un client actif → erreur affichée
- [ ] Ajouter un client avec un email mal formé → validation refusée
- [ ] Définir un plafond de crédit (ex: 50 000 FCFA) → visible sur la card

### Recherche
- [ ] Taper un prénom partiel dans la barre de recherche → filtrage instantané
- [ ] Taper un numéro partiel → filtrage par téléphone
- [ ] Le numéro `+237 699 111 111` et `237699111111` doivent matcher de la même façon

### Archivage
- [ ] Archiver un client → il disparaît de la liste
- [ ] Cocher "Voir les archivés" (gérant) → il réapparaît avec badge "Archivé"
- [ ] Désarchiver → retour à la normale
- [ ] Tenter d'ajouter un nouveau client avec le téléphone d'un client archivé → autorisé

### Détails client
- [ ] Cliquer sur l'œil 👁 d'un client → drawer s'ouvre avec ses infos
- [ ] Drawer affiche bien : avatar, coordonnées, stats (0 achats si pas de vente faite)
- [ ] Bouton "Modifier ce client" dans le drawer → ouvre la modal d'édition

### Permissions
- [ ] Se connecter en tant que caissier (Paul/Fatou) → page Clients accessible
- [ ] En caissier, boutons "Archiver" et "Supprimer" sont absents
- [ ] En caissier, toggle "Voir les archivés" est absent

### Intégration caisse
- [ ] Aller à la caisse → un bouton "Aucun client sélectionné" apparaît en haut du panier
- [ ] Cliquer dessus → la fiche déroulante s'ouvre avec champ de recherche
- [ ] Taper "marie" → Marie apparaît dans les résultats → la sélectionner → bouton mis à jour
- [ ] Cliquer la croix X sur le bouton client → désélection
- [ ] Cliquer "+ Nouveau client" sans avoir tapé → modal créée s'ouvre vide
- [ ] Cliquer "+ Nouveau client" après avoir tapé un numéro → modal pré-remplie avec ce numéro
- [ ] Créer un nouveau client depuis la caisse → il est immédiatement sélectionné
- [ ] Faire une vente avec un client sélectionné → vente OK, client retiré du panier après validation
- [ ] Réimprimer ce reçu depuis la page Ventes → le nom du client apparaît sur le reçu

### Historique d'achats
- [ ] Après avoir fait quelques ventes liées à un client, ouvrir son drawer Détails → l'historique apparaît
- [ ] Les ventes remboursées sont barrées et grisées dans l'historique

### Mode offline
- [ ] Couper le réseau (devtools → Network → Offline)
- [ ] Ajouter un client → succès local, toast OK
- [ ] Réactiver le réseau → vérifier dans Firestore Console que le client est synchronisé

---

## 🚀 Pour pousser sur Git

```bash
# 1. Remplacer ton dossier local par le contenu du zip
#    (sauvegarde d'abord ton .env et tes credentials Firebase si différents !)

# 2. Vérifier les changements
git status
git diff src/

# 3. Commit
git add .
git commit -m "feat(clients): module clients complet (v1.1)

- Page Clients avec CRUD, archivage, drawer détails
- CustomerPicker intégré à la caisse
- Sale étendu avec customerId/customerName optionnels
- 23 tests unitaires, 266/266 passent
- Fix bug latent d'IDs collisionnaires (Date.now() seul)

Voir CHANGELOG-v1.1.md pour le détail."

# 4. Push
git push origin main
```

---

## ➡️ Prochaine étape : Module Crédit (v1.1.2)

Le module Crédit est le suivant. Il s'appuie sur Clients :
- Nouveau mode de paiement `credit` à la caisse
- Page "Crédit & créances" : encours par client, règlements partiels
- Vérification du plafond de crédit à la caisse
- Affichage spécifique sur le reçu (mention "À crédit" + signature)

Quand tu as testé la v1.1 et que tout va bien, dis-moi "On passe au crédit" et j'enchaîne.

Si tu trouves un bug ou veux ajuster quelque chose dans le module Clients avant d'aller plus loin, indique-le-moi — on corrige avant de continuer pour ne pas accumuler de dette technique.
