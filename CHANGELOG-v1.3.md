# Legwan v1.3 — Inventaire & Réconciliation

**Date :** 19 mai 2026
**Module livré :** Inventaire (Étape 6 / 6 de la Phase 1 élargie)

> 🏁 **C'est la dernière étape de la Phase 1 élargie.** Avec ce module, Legwan dispose maintenant d'un **POS complet, compétitif au niveau international**, avec en plus des spécificités africaines uniques (crédit, prix négociable, sessions).

---

## ✨ Fonctionnalités

### Page Inventaire (`/inventaire`, gérant uniquement)

**3 onglets** :

#### 1. Nouvelle session
- **Périmètre** au choix : Tout le magasin / Par catégorie / Sélection manuelle
- Mode manuel : checkboxes par produit avec stock actuel affiché
- Notes optionnelles (ex: "Inventaire mensuel mai 2026")
- Compteur de produits dans le périmètre + avertissement "faire boutique fermée"
- Liste des sessions ouvertes existantes pour reprendre

#### 2. Saisie
- Tableau pleine largeur : produit / stock théorique / stock compté / écart / motif
- **Saisie en temps réel** : l'écart se met à jour à chaque modification
- Couleur de l'écart : rouge si négatif (perte), vert si positif (gain)
- **Motif obligatoire dès qu'il y a un écart** ≠ 0
- 8 motifs : avarié, casse, vol, périmé, erreur de saisie, consommation interne, cadeau/don, non identifié
- **Filtre** : Tout / Non comptés / Avec écart (utile sur gros catalogues)
- Stats en temps réel : Comptés (X/Y), Écarts (N), Motifs manquants (M)

#### 3. Historique
- Tableau des sessions validées avec n°, périmètre, date, validé par, écart qté + valorisation
- Couleur de la valorisation : rouge si perte, normal sinon
- Click sur l'œil → drawer avec détails complets + lignes ayant eu un écart

### Workflow de validation

```
1. Session créée → status = draft
2. Première saisie → status = in_progress
3. Validation cliquée :
   3a. Si motif manquant sur une ligne avec écart → REFUS + liste des produits problématiques
   3b. Si tout OK :
       - Génère 1 mouvement de stock 'ajustement' par ligne avec écart
       - Met à jour le stock de chaque produit (delta)
       - Calcule totalEcartQty et totalEcartValue (au prix d'achat)
       - Marque la session 'validated' + qui a validé + quand
       - 🔒 Session figée, plus modifiable
4. Annulation (avant validation) → status = cancelled, aucun effet sur les stocks
```

### Format de numéro
`INV-2026-001`, `INV-2026-002`, ... — incrémenté par année.

---

## 🏗️ Architecture

### Type `StockMovement` étendu (rétro-compatible)

```ts
interface StockMovement {
  // ... champs existants
  reason?: AdjustmentReason;        // NOUVEAU : motif d'ajustement (8 valeurs)
  inventorySessionId?: string;      // NOUVEAU : lien vers la session
}

type AdjustmentReason =
  | 'avarie' | 'casse' | 'vol' | 'peremption'
  | 'erreur_saisie' | 'consommation_interne' | 'cadeau_don' | 'non_identifie';
```

**Rétro-compatibilité** : les mouvements existants n'ont pas ces champs. Pas de migration nécessaire.

### Nouvelle collection Firestore : `boutiques/{bid}/inventory_sessions`
```ts
{
  id, numero, scope, scopeCategorie?, status,
  createdAt, createdBy, createdByName,
  validatedAt?, validatedBy?, validatedByName?,
  cancelledAt?, cancelledBy?,
  lines: InventoryLine[],
  totalEcartQty?, totalEcartValue?,
  notes?
}
```

### `useInventoryStore` — API publique

```ts
createSession({ scope, scopeCategorie?, products, userId, userName, notes? }): InventorySession
updateLine(sessionId, productId, { stockCompte?, reason?, notes? }): void
updateNotes(sessionId, notes): void
cancelSession(sessionId, userId): void
validateSession(sessionId, userId, userName, deps): { success: true, session } | { success: false, missingReasons }
getOpenSessions(): InventorySession[]
getValidatedInRange(start, end): InventorySession[]
```

### Pattern d'injection de dépendances

`validateSession` reçoit deux callbacks externes :
- `getProductPrixAchat(id)` — pour valoriser les écarts au prix d'achat
- `addMovementAndUpdateStock({...})` — pour créer le mouvement et mettre à jour le stock produit

C'est **délibéré** : ça évite les cycles d'import entre `useInventoryStore` ↔ `useStockStore` ↔ `useProductStore`, et ça rend la fonction **100% testable en isolation** (le test peut injecter des spies). Pattern qui a déjà servi sur `applyCreditPayment`.

---

## 📁 Fichiers ajoutés

```
src/stores/useInventoryStore.ts                ← store + types (250 lignes)
src/pages/InventairePage.tsx                   ← page complète (~540 lignes)
src/test/stores/useInventoryStore.test.ts      ← 22 tests
src/test/integration/inventory-flow.test.ts    ← 5 tests d'intégration
```

## 📝 Fichiers modifiés

```
src/stores/useStockStore.ts                    ← +AdjustmentReason, +reason, +inventorySessionId
                                                 + fix ID collisionnaire (suffixe random)
                                                 + addMovement retourne maintenant le mouvement
src/services/firestoreService.ts               ← fsLoadInventorySessions, fsSaveInventorySession, fsDeleteInventorySession
src/components/FirebaseProvider.tsx            ← bootstrap inventory_sessions
src/App.tsx                                    ← route /inventaire (gérant)
src/components/layout/Sidebar.tsx              ← item "Inventaire" (icône ClipboardList)
src/test/stores/useStockStore.test.ts          ← test ID mis à jour + nouveau test de régression
```

---

## ✅ Validation technique

| Métrique | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx vite build` | **succès, PWA généré** |
| Tests | **441 / 441** (+28 nouveaux : 22 store + 5 intégration + 1 régression ID) |

---

## 🐛 Bug corrigé pendant l'intégration

**ID collisionnaire sur `useStockStore.addMovement`** : même bug que celui traité en v1.1.1 pour `useCustomerStore` et en v1.1.2 pour `useSaleStore` / `usePaymentStore`. Le format `'m' + Date.now()` peut collisionner. **Corrigé** avec un suffixe random de 5 caractères. Le test existant a été mis à jour et un test de régression ajouté.

**Type narrowing TypeScript** : la fonction `validateSession` retourne une union discriminée `{ success: true } | { success: false }`. L'écriture `if (!result.success)` ne suffit pas à TypeScript pour resserrer le type ; il faut `if (result.success === false)`. Corrigé dans la page.

---

## 🧪 Checklist de tests manuels

### Création d'une session
- [ ] Menu **Inventaire** (gérant) → onglet "Nouvelle"
- [ ] Choisir "Tout le magasin" → le compteur affiche le nombre total de produits
- [ ] Choisir "Par catégorie" → sélecteur de catégorie apparaît → le compteur s'adapte
- [ ] Choisir "Sélection manuelle" → liste cochable → sélectionner 3 produits → compteur = 3
- [ ] Cliquer "Démarrer la session" → redirection vers l'onglet Saisie
- [ ] Toast : *"Session INV-2026-001 créée — 3 lignes à compter"*

### Saisie
- [ ] Le tableau affiche les 3 produits avec stock théorique
- [ ] Saisir un nombre dans "Compté" pour le premier produit → l'écart se met à jour en temps réel
- [ ] Si écart = 0 → ligne en gris, pas de motif demandé
- [ ] Si écart < 0 → écart en rouge, dropdown motif apparaît
- [ ] Le bord du dropdown est rouge tant qu'aucun motif n'est choisi
- [ ] Stats du haut : "Comptés 1/3", "Écarts 1", "Motifs manquants 1"
- [ ] Choisir un motif (ex: "Casse") → "Motifs manquants" passe à 0
- [ ] Bouton "Valider" devient cliquable

### Filtres
- [ ] Cliquer "Non comptés" → seuls les produits non comptés s'affichent
- [ ] Cliquer "Avec écart" → seuls les écarts apparaissent (utile gros catalogue)

### Validation (le test critique)
- [ ] Cliquer "Valider la session" avec tous les motifs renseignés
- [ ] Toast vert : *"Session INV-2026-001 validée — N ajustements effectués"*
- [ ] Aller dans **Stock** → vérifier que les stocks des produits ont changé selon les écarts
- [ ] Aller dans **Inventaire → Historique** → la session est listée avec écart qté + valorisation
- [ ] Cliquer l'œil → drawer avec liste des ajustements et motifs

### Refus de validation
- [ ] Créer une nouvelle session, faire une saisie avec écart, NE PAS choisir de motif
- [ ] Tenter de valider → bouton désactivé + message rouge
- [ ] Si on force (devtools) → toast d'erreur listant les produits problématiques

### Annulation
- [ ] Créer une session, faire quelques saisies
- [ ] Cliquer "Annuler la session" → confirm → toast "Session annulée"
- [ ] Aller dans Stock → vérifier qu'aucun stock n'a changé

### Brouillon
- [ ] Faire une saisie partielle, cliquer "Sauvegarder en brouillon"
- [ ] Retourner à l'onglet "Nouvelle" — la session apparaît dans "Sessions ouvertes"
- [ ] Click → reprise de la saisie là où on était

### Permissions
- [ ] Caissier connecté → l'item "Inventaire" est masqué dans le menu
- [ ] Accès direct `/inventaire` en caissier → redirection (route protégée)

### Mode offline
- [ ] Couper le réseau → créer une session → saisir → valider → tout local
- [ ] Rétablir le réseau → vérifier dans Firestore Console que les `inventory_sessions` et les `movements` sont synchronisés

---

## ⚠️ Limites assumées

1. **Pas d'export PDF du procès-verbal d'inventaire** — la session validée n'est consultable qu'en interface. À ajouter si les boutiques en ont besoin pour l'archive papier.

2. **Pas de gestion du "stock figé pendant inventaire"** — si on fait une vente pendant qu'un inventaire est en cours, le stock du produit bouge mais pas le `stockTheorique` de la ligne (qui a été snapshotté à la création de la session). C'est cohérent avec la pratique métier ("on compte ce qu'on a au moment T") mais il faut le savoir : idéalement on fait l'inventaire boutique fermée.

3. **Pas de scan code-barres pour la saisie** — pourrait accélérer la saisie sur gros catalogue. À voir si la demande émerge.

4. **Pas de comptage à l'aveugle** — actuellement le caissier voit le stock théorique pendant la saisie, ce qui peut biaiser le comptage (tentation de "valider" le théorique sans vraiment compter). Une option "mode aveugle" qui masque le théorique pendant la saisie pourrait améliorer la rigueur — à voir en v2.

---

## 🚀 Pour pousser sur Git

```bash
unzip legwan-v1.3-inventaire.zip
git status
git add .
git commit -m "feat(inventaire): module inventaire & réconciliation (v1.3)

- Sessions d'inventaire (complet / catégorie / manuel)
- Comptage avec écarts en temps réel + 8 motifs d'ajustement
- Validation avec génération automatique des mouvements de stock
- Historique avec drawer de détails
- 28 nouveaux tests, 441 / 441 au total
- Fix bug ID collisionnaire dans useStockStore

Phase 1 élargie complète (6/6 modules). Voir CHANGELOG-v1.3.md."

git push origin main
```

---

## 🏁 État de la Phase 1 élargie : COMPLET

| Étape | Module | Version | Tests | Statut |
|---|---|---|---|---|
| 1 | Clients | v1.1 | 23 | ✅ |
| 2 | Crédit | v1.1.2 | 64 | ✅ |
| 3 | Dépenses | v1.1.3 | 21 | ✅ |
| 4 | Prix négociable | v1.2.1 | 37 | ✅ |
| 5 | Sessions de caisse | v1.2.2 | 25 | ✅ |
| **6** | **Inventaire** | **v1.3** | **28** | ✅ |
| | **TOTAL** | | **+198 tests** | |

**Tests** : 441 / 441 (de 243 initiaux à 441 — +81%)
**Build** : propre, PWA généré
**Type-check** : 0 erreur sur l'intégralité du projet

---

## 🎯 Ce que Legwan fait maintenant que les concurrents ne font pas

| Feature | Legwan v1.3 | Loyverse | Hiboutik | Odoo POS |
|---|---|---|---|---|
| Clients & historique | ✅ | ✅ | ✅ | ✅ |
| Vente à crédit + suivi encours | ✅ | ❌ | ⚠️ Basique | ✅ |
| Plafond de crédit par client | ✅ | ❌ | ❌ | ⚠️ |
| Règlements partiels avec PO Mobile | ✅ | ❌ | ❌ | ✅ |
| Dépenses + bénéfice net auto | ✅ | ❌ | ✅ | ✅ |
| **Prix négociable avec fourchette** | ✅ | ❌ | ❌ | ❌ |
| **Override gérant pour vente sous plancher** | ✅ | ❌ | ❌ | ⚠️ |
| Sessions de caisse par caissier | ✅ | ⚠️ | ✅ | ✅ |
| **Sorties de caisse typées** (avance, prêt...) | ✅ | ❌ | ⚠️ | ⚠️ |
| **Lien auto dépenses espèces ↔ session** | ✅ | ❌ | ❌ | ⚠️ |
| Inventaire complet/catégorie/manuel | ✅ | ✅ | ✅ | ✅ |
| Inventaire avec motifs d'écart obligatoires | ✅ | ⚠️ | ⚠️ | ✅ |
| Mode offline complet (Firestore cache) | ✅ | ⚠️ | ❌ | ❌ |
| Interface en français Cameroun + FCFA natif | ✅ | ⚠️ | ⚠️ | ⚠️ |

Les vraies différenciations qui justifient Legwan vs les acteurs internationaux : **le prix négociable, l'override gérant, et le lien dépenses↔sessions**. Aucun POS occidental ne traite ces problèmes parce qu'ils n'existent pas dans leurs marchés.

---

## ➡️ Prochaine phase

**Tu es maintenant à un moment décisif.** Trois options :

### Option A — Déploiement pilote ⭐ (ce que je recommande)
Mets v1.3 en production sur **2 à 3 boutiques amies** pendant **4 à 6 semaines**. Collecte les retours réels. Tu apprendras plus de leur usage que de n'importe quel module supplémentaire codé à l'aveugle.

### Option B — Phase 2 (industrialisation)
Selon la roadmap :
- TVA / impôts (si tes pilotes sont en zone CEMAC formelle)
- Audit log (qui a fait quoi, requis pour assurance/litiges)
- Transactions Firestore atomiques (résout les race conditions documentées)
- Bons de commande fournisseur
- Notifications low-stock

### Option C — Vertical métier
Adapter à un domaine particulier :
- Restaurant / bar (tables, addition fractionnée)
- Pharmacie (lots, péremption, ordonnances)
- Quincaillerie (poids/volume, location matériel)

Dis-moi vers quelle direction tu veux aller. Bonne route avec **Legwan v1.3** 🚀
