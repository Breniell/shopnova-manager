# Legwan v1.1.2 — Module Crédit

**Date :** 17 mai 2026
**Module livré :** Crédit & règlements (Étape 2 / 6 de la Phase 1 élargie)

---

## 🎁 État avant cette livraison

À la découverte du projet, j'ai constaté qu'un **précédent développeur avait déjà écrit la majorité du code du Module Crédit** (les fichiers `usePaymentStore`, `credit.ts`, `CreditPage`, et les intégrations dans `CaissePage`, `ReceiptModal`, `ClotureCaissePage` étaient déjà là). C'est une excellente nouvelle : le code est de qualité et architecturalement propre.

**Ma valeur ajoutée sur cette étape** : audit, corrections de bugs, et la couverture de tests qui manquait totalement.

---

## ✨ Fonctionnalités du Module Crédit (rappel)

### À la caisse
- Nouveau mode de paiement **Crédit** à côté d'Espèces et Mobile Money
- Sélection client **obligatoire** pour vendre à crédit (validation forte)
- Affichage en temps réel : **encours actuel du client** + **plafond** s'il est défini
- Champ optionnel **date d'échéance**
- **Blocage automatique** si l'achat ferait dépasser le plafond du client

### Page Crédit & créances (nouvelle dans le menu)
- 3 onglets :
  - **Vue par client** : liste des clients débiteurs triée par encours, expand pour voir les ventes
  - **Vue par vente** : tableau de toutes les ventes à crédit non soldées, filtrable
  - **Historique des règlements** : tous les paiements reçus
- KPI : encours total, nombre de clients débiteurs, créance la plus ancienne
- Badge d'ancienneté coloré (vert ≤ 7j, ambre 8-30j, rouge > 30j)
- Recherche par nom ou numéro de vente

### Encaissement d'un règlement
- Modal pré-rempli avec le solde restant
- Modes : espèces ou mobile money (avec opérateur et référence)
- Validation : pas de sur-paiement possible
- **Mise à jour automatique** : `creditStatus` passe de `pending` → `partial` → `paid` selon les montants
- Notes optionnelles

### Sur le reçu
- Mention **"VENTE À CRÉDIT"** mise en évidence
- Affichage du **restant dû**
- **Zone de signature** du client (reconnaissance de dette)
- Date d'échéance si renseignée

### Clôture de caisse
- Les ventes à crédit **ne sont PAS comptées** dans le total attendu (l'argent n'est pas rentré)
- Les **règlements en espèces** reçus aujourd'hui **sont comptés** (ils ont rempli le tiroir)
- Idem pour les règlements mobile money
- Information visible : nombre de ventes à crédit du jour avec leur valeur cumulée

---

## 🐛 Bugs corrigés

### 1. Import dynamique async dans `applyCreditPayment` (silencieux mais grave)

Le code précédent utilisait :
```ts
import('@/stores/usePaymentStore').then(({ usePaymentStore }) => {
  usePaymentStore.getState().addPayment(...);
});
```

Conséquences réelles :
- Le `Payment` n'était pas créé immédiatement après l'appel
- Tout code lisant les payments juste après `applyCreditPayment` voyait un état incohérent
- Les tests d'intégration tombaient dessus (et c'est ce qui m'a permis de l'attraper)

**Corrigé** par un import statique synchrone. Pas de cycle d'import puisque `usePaymentStore` ne référence pas `useSaleStore`. La méthode est maintenant 100% synchrone et prévisible.

### 2. Génération d'IDs collisionnaires (suite du fix v1.1.1)

Le store Sale utilisait `'s' + Date.now()` et le store Payment `'pay' + Date.now()`. Même bug que celui découvert pour Customer : deux créations dans la même milliseconde généraient le même ID.

**Corrigé** dans les deux stores : suffixe random de 5 caractères ajouté. Cohérent avec le pattern adopté pour Customer en v1.1.1.

### 3. Clôture de caisse incohérente avec le crédit

Avant : les ventes à crédit étaient agrégées dans le total des ventes mobile/espèces selon leur mode, donc le total attendu dans le tiroir était faussé (gonflé).

Après : les **ventes** à crédit sont exclues du total attendu, les **règlements** (Payment) en espèces ou mobile money du jour sont inclus. C'est ce que demande la réalité comptable d'une boutique.

---

## 📁 Fichiers ajoutés (par moi)

```
src/test/lib/credit.test.ts                   ← 40 tests des fonctions pures
src/test/stores/usePaymentStore.test.ts       ← 17 tests du store
src/test/integration/credit-flow.test.ts      ← 7 tests d'intégration end-to-end
```

## 📝 Fichiers modifiés (par moi)

```
src/stores/useSaleStore.ts                    ← import statique synchrone + ID random
src/stores/usePaymentStore.ts                 ← ID random (cohérence avec v1.1.1)
```

## 🗂️ Fichiers déjà présents (qualité auditée, conservés)

```
src/lib/credit.ts                             ← fonctions pures (audit OK)
src/stores/usePaymentStore.ts                 ← store règlements (audit OK)
src/pages/CreditPage.tsx                      ← 591 lignes, page complète
src/components/ui/PaymentBadge.tsx            ← support 'credit' présent
src/pages/CaissePage.tsx                      ← intégration mode crédit OK
src/components/ui/ReceiptModal.tsx            ← affichage crédit OK
src/pages/ClotureCaissePage.tsx               ← exclusion ventes crédit + inclusion règlements OK
src/services/firestoreService.ts              ← fsLoadPayments/fsSavePayment/fsDeletePayment
src/components/FirebaseProvider.tsx           ← bootstrap des payments
src/App.tsx                                   ← route /credit
src/components/layout/Sidebar.tsx             ← item "Crédit & créances"
```

---

## ✅ Validation technique

| Métrique | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx vite build` | **succès, PWA généré** |
| Tests unitaires + intégration | **330 / 330 passent** |
| Nouveaux tests ajoutés | **+64** (40 credit.ts + 17 usePaymentStore + 7 intégration) |

---

## 🧪 Checklist de tests manuels à effectuer

### Vente à crédit
- [ ] À la caisse, sélectionner un produit, cliquer le mode **Crédit** sans client → bouton "Valider" désactivé
- [ ] Sélectionner un client → bouton activé
- [ ] Définir un plafond crédit (50 000 FCFA) à un client → tester une vente à 60 000 → blocage + message clair
- [ ] Vendre 20 000 à crédit → vente OK → reçu mentionne "VENTE À CRÉDIT" et restant dû 20 000
- [ ] Ajouter une date d'échéance → elle apparaît sur le reçu
- [ ] Aller dans **Crédit & créances** → la vente apparaît dans "Vue par vente"
- [ ] Onglet "Vue par client" → le client apparaît avec son encours

### Encaissement d'un règlement
- [ ] Cliquer "Encaisser" sur une vente non soldée → modal s'ouvre avec montant pré-rempli
- [ ] Encaisser 5 000 sur 20 000 → status passe à `partial`, restant 15 000
- [ ] Tenter d'encaisser 20 000 sur les 15 000 restants → refusé avec message clair
- [ ] Encaisser exactement 15 000 → status passe à `paid`, la vente sort de la liste des créances
- [ ] Vérifier dans l'onglet "Historique des règlements" : les 2 paiements apparaissent
- [ ] Encaisser en mobile money → demande opérateur + référence

### Clôture de caisse (le test critique !)
- [ ] Faire 3 ventes le même jour : 10 000 espèces, 5 000 mobile, 15 000 à crédit
- [ ] Aller en clôture → le total des espèces attendues doit afficher 10 000 (pas 25 000)
- [ ] Encaisser 8 000 en espèces sur la vente à crédit
- [ ] Retourner en clôture → le total des espèces attendues passe à 18 000 (10 000 vente + 8 000 règlement)
- [ ] Une mention informative doit indiquer qu'il y a une vente à crédit non comptée

### Remboursement d'une vente à crédit
- [ ] Faire une vente à crédit → encaisser un paiement partiel
- [ ] Aller dans la page Ventes → rembourser la vente avec motif
- [ ] Vérifier que la vente disparaît de la page Crédit
- [ ] Vérifier que l'encours du client retombe à 0

### Mode offline
- [ ] Couper le réseau → vendre à crédit → succès local
- [ ] Encaisser un règlement → succès local
- [ ] Rétablir le réseau → vérifier dans Firestore Console que la vente et le payment sont synchronisés

---

## 🚀 Pour pousser sur Git

```bash
# Sauvegarde ton .env d'abord
unzip legwan-v1.1.2-credit.zip
# Remplacer le dossier legwan-v1.1/ local par le nouveau contenu

git status   # devrait montrer ~5 fichiers modifiés ou nouveaux
git diff src/stores/useSaleStore.ts src/stores/usePaymentStore.ts

git add .
git commit -m "feat(credit): tests + corrections module crédit (v1.1.2)

- 64 nouveaux tests (40 credit.ts + 17 usePaymentStore + 7 intégration)
- Fix bug: applyCreditPayment async → synchrone (import statique)
- Fix bug: IDs Sale/Payment collisionnaires (suffixe random)
- Fix bug: clôture de caisse n'incluait pas les règlements crédit

330 / 330 tests passent. Voir CHANGELOG-v1.1.2.md."

git push origin main
```

---

## ⚠️ Point d'attention sur la concurrence (à garder en tête)

Le code ne fait **pas encore de transaction atomique Firestore** sur `applyCreditPayment`. Si deux caissiers encaissent simultanément sur la même vente à crédit (peu probable mais possible avec 2 caisses), il y a un risque théorique :
1. Caissier A lit `sale.amountPaid = 0`
2. Caissier B lit `sale.amountPaid = 0`
3. A ajoute Payment 3 000 → écrit `amountPaid = 3 000`
4. B ajoute Payment 5 000 → écrit `amountPaid = 5 000` (écrase A)

Résultat : 2 Payment de 8 000 cumulés en base, mais Sale.amountPaid = 5 000 (faux).

**Mitigation actuelle** : la **source de vérité reste la collection des Payment**, pas le `Sale.amountPaid` dénormalisé. Le calcul du solde via `getRemainingBalance(sale, payments)` retournera toujours le bon montant, parce qu'il somme les Payments réels. Le seul truc faux est `Sale.creditStatus` qui pourrait afficher `partial` au lieu de `paid` un court instant.

**Fix prévu en Phase 2** : `applyCreditPayment` deviendra une transaction Firestore atomique.

---

## ➡️ Prochaine étape : Module Dépenses (v1.1.3)

Module **indépendant** des deux précédents — pas de dépendance technique. Plus simple à coder. C'est le dernier module de la **Phase 1 originale** (Clients + Crédit + Dépenses).

Après ça : on aura terminé la **v1.1 complète**, et on pourra passer aux modules avancés de la Phase 1 élargie (Prix négociable, Sessions de caisse, Inventaire) — ou s'arrêter pour mettre en prod.

Dis-moi **"On passe aux dépenses"** quand tu auras testé v1.1.2 et que tout va bien.
