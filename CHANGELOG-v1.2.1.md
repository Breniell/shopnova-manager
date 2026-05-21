# Legwan v1.2.1 — Module Prix négociable (Premium)

**Date :** 17 mai 2026
**Module livré :** Prix négociable avec fourchette (Étape 4 / 6 de la Phase 1 élargie)

> 🎯 **Un différenciateur unique** : aucun POS occidental ne gère le marchandage avec seuil plancher. Au Cameroun, c'est la réalité quotidienne d'une boutique de quartier.

---

## ✨ Fonctionnalités

### À la caisse

- **Le prix unitaire d'une ligne du panier est cliquable** (si le produit est négociable)
- Modal **"Négocier le prix"** affichant :
  - Plancher / Cible / Affiché (3 repères visuels)
  - Champ pour saisir un nouveau prix unitaire
  - **Marge brute estimée en temps réel** (verte si > 10%, ambre si 0–10%, rouge si négative)
  - Indicateur d'état coloré :
    - 🟢 OK normal (entre cible et affiché)
    - 🟡 OK avec alerte "marge réduite" (entre plancher et cible)
    - 🔴 Bloqué : prix > affiché OU produit non négociable
    - 🔴 Override gérant requis : prix < plancher

### Sous le plancher → Override gérant

- Modal **"Autorisation gérant"** demandant :
  - Le choix du gérant (parmi tous les gérants de la boutique)
  - Son PIN à 4 chiffres
- Validation cryptographique du PIN (`hashPin` SHA-256)
- Sur OK, la négociation est appliquée avec **traçabilité complète** :
  - `overrideBy: userId` du gérant ayant autorisé
  - `overrideByName: nom complet` pour affichage

### Affichage dans le panier

- Prix barré + nouveau prix quand négocié
- Pastille colorée :
  - **⚡** rouge si vente sous plancher (override utilisé)
  - **•** ambre si vente sous cible (marge réduite)
- Total de la ligne recalculé avec le prix négocié

### Sur le reçu

- Prix barré (affiché) + nouveau prix appliqué pour les lignes négociées
- Le client voit qu'il a obtenu une réduction → effet "gagnant"

### Page Produits

- Nouvelle section **"Négociation"** dans le formulaire :
  - Case à cocher **"Prix négociable à la caisse"**
  - Champ **Prix plancher** (vide → fallback prixAchat)
  - Champ **Prix cible** (vide → fallback prixVente)
- Validation des invariants à la saisie :
  - Plancher ≥ prix d'achat (sinon vente à perte)
  - Cible ≥ plancher
  - Cible ≤ prix affiché

---

## 🏗️ Architecture (nouveau code)

### `src/lib/pricing.ts` — fonctions pures (132 lignes)

```ts
checkPrice(product, requestedPrice): PriceCheckResult
getEffectiveFloor(product): number       // explicit ?? prixAchat
getEffectiveTarget(product): number      // explicit ?? prixVente
isNegociable(product): boolean
getMarginPercent(product, price): number
getLossFromNegotiation(item): number
getAppliedPrice(item): number            // prixUnitaire ?? prixVente
```

Tout est **pur, testable en isolation, sans accès aux stores**. 28 tests unitaires couvrent tous les cas.

### Type Product étendu (rétro-compatible)

```ts
interface Product {
  // ... champs existants
  prixCible?: number;        // NOUVEAU — optionnel
  prixPlancher?: number;     // NOUVEAU — optionnel
  negociable?: boolean;      // NOUVEAU — optionnel (false par défaut)
}
```

**Aucune migration nécessaire** : les produits existants ne sont pas négociables par défaut (comportement identique à v1.1.3).

### Type CartItem étendu

```ts
interface CartItem {
  prixVente: number;            // affiché (préservé)
  prixUnitaire?: number;        // appliqué (négocié ou = prixVente)
  negotiated?: {
    discount: number;
    belowFloor: boolean;
    overrideBy?: string;
    overrideByName?: string;
  };
}
```

**Rétro-compatibilité** : `prixUnitaire` optionnel pour ne pas casser les `Sale.items` historiques. Toutes les fonctions utilisent `prixUnitaire ?? prixVente`.

### Nouveau composant : `PriceEditor.tsx`

Modal de négociation, ~180 lignes. Toute la logique de status (ok / alerte / bloqué) déléguée à `checkPrice()`.

### Nouveau composant : `ManagerOverrideModal.tsx`

Validation PIN gérant (4 chiffres), ~120 lignes. Comparaison SHA-256 via `hashPin`.

### Nouvelle méthode store : `applyPriceOverride`

```ts
applyPriceOverride(productId, newPrice, belowFloor, override?)
```

- Met à jour `prixUnitaire` sur la ligne du panier
- Si `newPrice === prixVente` → retire `negotiated` (retour au prix normal)
- Si `belowFloor === true` → enregistre l'override gérant

---

## 📁 Fichiers ajoutés

```
src/lib/pricing.ts                                    ← 8 fonctions pures
src/components/ui/PriceEditor.tsx                     ← modal négociation
src/components/ui/ManagerOverrideModal.tsx            ← override PIN gérant
src/test/lib/pricing.test.ts                          ← 28 tests
src/test/integration/negotiation-flow.test.ts         ← 9 tests d'intégration
```

## 📝 Fichiers modifiés

```
src/stores/useProductStore.ts        ← +prixCible, +prixPlancher, +negociable
src/stores/useSaleStore.ts           ← CartItem.prixUnitaire + negotiated + applyPriceOverride
src/lib/validations.ts               ← productSchema étendu + invariants
src/pages/ProduitsPage.tsx           ← section "Négociation" + validation
src/pages/CaissePage.tsx             ← intégration PriceEditor + override
src/components/ui/ReceiptModal.tsx   ← affichage prix barré
```

---

## ✅ Validation technique

| Métrique | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx vite build` | **succès, PWA généré** |
| Tests | **388 / 388 passent** (+37 nouveaux : 28 pricing + 9 intégration) |

---

## 🧪 Checklist de tests manuels

### Configuration produit
- [ ] Aller dans **Produits** → modifier un produit → cocher "Prix négociable"
- [ ] Saisir Plancher = 1500, Cible = 1800, Prix affiché = 2000 → enregistrer
- [ ] Vérifier qu'on ne peut PAS enregistrer Plancher < prix d'achat
- [ ] Vérifier qu'on ne peut PAS enregistrer Cible > prix affiché
- [ ] Décocher "Négociable" → les champs disparaissent visuellement

### Négociation à la caisse — cas normal
- [ ] Ajouter le produit (prix 2000) au panier → le prix affiché est cliquable
- [ ] Cliquer dessus → modal "Négocier le prix" s'ouvre
- [ ] Saisir 1900 → statut **🟢 Prix normal**, marge en vert
- [ ] Cliquer "Appliquer" → le panier montre **2000 barré + 1900 •** (ambre car sous cible ? non, 1900 > 1800)
- [ ] Vérifier le total du panier mis à jour avec 1900

### Négociation — alerte cible
- [ ] Saisir 1700 → statut **🟡 Sous le prix cible — marge réduite**
- [ ] Appliquer → toast "Prix négocié — marge réduite" + pastille ambre `•`

### Négociation — bloqué au-dessus
- [ ] Tenter de saisir 2500 → statut **🔴 Au-dessus du prix affiché**
- [ ] Bouton "Appliquer" désactivé

### Override gérant
- [ ] Saisir 1200 (sous plancher 1500) → statut **🔴 Autorisation gérant requise**
- [ ] Bouton change : "Demander autorisation"
- [ ] Cliquer → modal **"Autorisation gérant"** s'ouvre
- [ ] Choisir un gérant + saisir PIN incorrect → toast erreur
- [ ] Saisir bon PIN → toast "Override autorisé par [nom]" + panier montre `⚡`
- [ ] Valider la vente → reçu montre 2000 barré et 1200 appliqué

### Produit non négociable
- [ ] Sur un produit dont la case n'est PAS cochée, le prix dans le panier n'est pas cliquable
- [ ] Tooltip "Prix fixe" au survol

### Persistance
- [ ] Faire une vente avec un produit négocié à 1600
- [ ] Aller dans **Ventes** → ouvrir cette vente → réimprimer le reçu
- [ ] Le reçu réimprimé doit toujours montrer 2000 barré et 1600 appliqué

### Page Rapports
(Le module "Rapport hebdo des négociations" n'est PAS encore implémenté en v1.2.1 — prévu pour une release ultérieure si nécessaire.)

---

## 🐛 Bugs trouvés / corrigés

Aucun cette fois. Le module est entièrement nouveau, pas de zone d'interaction avec du code existant complexe.

⚠️ **Note technique** : la nouvelle méthode `applyPriceOverride` utilise un destructuring TypeScript pour retirer proprement le champ `negotiated` quand on remet le prix au prix de vente (`const { negotiated: _omit, ...rest } = item`). Cette syntaxe permet d'éviter de garder une propriété "fantôme" sur l'objet, ce qui simplifierait la sérialisation Firestore plus tard.

---

## 🚀 Pour pousser sur Git

```bash
unzip legwan-v1.2.1-prix-negociable.zip
# Remplacer le dossier legwan-v1.1/ par le nouveau contenu

git status
git add .
git commit -m "feat(prix-negociable): module prix négociable avec override gérant (v1.2.1)

- Nouveau type: prixCible, prixPlancher, negociable sur Product
- CartItem étendu avec prixUnitaire et negotiated (rétro-compatible)
- Modal PriceEditor + ManagerOverrideModal
- 28 tests pricing + 9 tests d'intégration, 388 / 388 au total

Voir CHANGELOG-v1.2.1.md."

git push origin main
```

---

## ➡️ Prochaine étape : Sessions de caisse (v1.2.2)

Le dernier module de la Phase 1 élargie côté caisse :
- Ouverture explicite d'une session par le caissier (déclaration du fond)
- Sorties exceptionnelles (avance, prêt, remboursement, achat impulsif)
- Clôture par session (pas juste journalière)
- **Lien automatique** entre les dépenses payées en espèces et les sorties de session → résout la limite documentée en v1.1.3

Dis-moi **"On continue avec les sessions"** quand tu auras testé v1.2.1.
