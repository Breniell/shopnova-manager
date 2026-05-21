# Legwan v1.1.3 — Module Dépenses + Phase 1 originale complète

**Date :** 17 mai 2026
**Module livré :** Dépenses (Étape 3 / 6 de la Phase 1 élargie)
**Jalon majeur :** 🎉 **Phase 1 originale terminée (v1.1 complète)**

---

## ✨ Module Dépenses — Nouveautés

### Page Dépenses (gérant uniquement)
- **CRUD complet** : ajouter, modifier, supprimer une dépense
- **12 catégories** prédéfinies, chacune avec sa couleur :
  Loyer · Électricité · Eau · Internet & téléphone · Transport · Salaires · Achats marchandises · Maintenance · Marketing · Taxes & impôts · Frais bancaires · Autre
- **4 modes de paiement** : Espèces, Mobile Money, Virement, Chèque
- Champs : date, catégorie, description, montant, bénéficiaire (optionnel), référence (optionnelle), notes
- **Validation Zod** à la saisie (montant > 0, description ≤ 200 chars, etc.)

### 4 KPI cards (filtrable par période : jour / semaine / mois / tout)
- **Total dépenses** de la période
- **Plus grosse catégorie** avec son montant
- **Nombre de dépenses**
- **Comparaison vs période précédente** (% avec couleur : rouge si en hausse, vert si en baisse)

### Camembert "Répartition par catégorie"
- Couleurs cohérentes avec les badges du tableau
- Légende détaillée
- Affichage des % uniquement quand ≥ 8% (lisibilité)

### Tableau filtrable
- Filtre par catégorie (select)
- Recherche par description, bénéficiaire ou référence
- Tri automatique par date (récents en premier)
- Footer avec total des dépenses filtrées
- Export CSV en un clic

### Note pédagogique en bas de page
> "Les dépenses payées en espèces depuis la caisse ne sont pas automatiquement déduites du total attendu à la clôture. À prendre en compte manuellement."
> (Lien naturel avec ce qui sera amélioré en Phase 2 via les sessions de caisse.)

---

## 💰 Impact sur la page Rapports (intégration déjà présente)

Le calcul du **bénéfice net** prend désormais en compte les dépenses :

```
Bénéfice net = Chiffre d'affaires − Coût marchandises vendues (COGS) − Dépenses
```

**Nouveau KPI "Bénéfice net"** affiché avec :
- Couleur **rouge** si négatif (déficit)
- Couleur **verte** si positif (profit)
- Pourcentage de marge nette à côté du libellé

Avec **KPI Dépenses** également visible.

Ces 2 KPI étaient déjà préparés par le dev précédent dans RapportsPage — j'ai juste alimenté le store qui leur faisait défaut.

---

## 📁 Fichiers ajoutés

```
src/stores/useExpenseStore.ts              ← store complet + helpers métadonnées
src/pages/DepensesPage.tsx                 ← page complète (700 lignes)
src/test/stores/useExpenseStore.test.ts    ← 21 tests unitaires
```

## 📝 Fichiers modifiés

```
src/lib/validations.ts                     ← expenseSchema (Zod)
src/services/firestoreService.ts           ← fsLoadExpenses, fsSaveExpense, fsDeleteExpense + path
src/components/FirebaseProvider.tsx        ← bootstrap des expenses
src/App.tsx                                ← retrait d'un doublon d'import laissé par le dev précédent
```

## 🗂️ Fichiers déjà préparés par le dev précédent (audit OK)

```
src/App.tsx                                ← route /depenses (déjà en place)
src/components/layout/Sidebar.tsx          ← item "Dépenses" + icône TrendingDown
src/pages/RapportsPage.tsx                 ← KPI Dépenses + Bénéfice net déjà câblés
```

---

## ✅ Validation technique

| Métrique | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx vite build` | **succès, PWA généré** |
| Tests | **351 / 351 passent** |
| Nouveaux tests ajoutés | **+21** |

---

## 🎯 Récap de la Phase 1 originale (v1.1.0 → v1.1.3)

| Étape | Module | Tests | Statut |
|-------|--------|-------|--------|
| 1 | **Clients** | 23 tests | ✅ v1.1.1 |
| 2 | **Crédit & règlements** | 64 tests | ✅ v1.1.2 |
| 3 | **Dépenses** | 21 tests | ✅ v1.1.3 |
| — | **Total Phase 1** | **+108 nouveaux tests** | ✅ **351/351 globaux** |

### Ce que tu peux faire maintenant que tu ne pouvais pas faire avant
- 🧾 **Gérer un fichier client** avec recherche, historique, archivage
- 🛒 **Sélectionner un client à la caisse** pour tracer ses achats
- 📋 **Vendre à crédit** avec plafond, échéance, suivi des encours
- 💸 **Encaisser des règlements partiels** sur les ventes à crédit
- 🏷️ **Enregistrer tes dépenses** par catégorie (loyer, électricité, etc.)
- 📊 **Voir ton bénéfice net** réel = ventes − coût marchandises − dépenses
- 🔍 **Identifier la plus grosse catégorie** de dépenses
- 📈 **Comparer une période à la précédente** automatiquement

### Bugs latents corrigés au passage (sur les 3 étapes)
1. IDs collisionnaires `Date.now()` → suffixe random partout (Customer, Sale, Payment, Expense)
2. Import dynamique async dans `applyCreditPayment` → synchrone
3. Clôture de caisse incluait les ventes à crédit → exclues (réalité comptable)
4. Doublon d'import `DepensesPage` dans App.tsx → nettoyé

---

## 🧪 Checklist de tests manuels — Module Dépenses

### Création
- [ ] Aller dans **Dépenses** → cliquer "Nouvelle dépense"
- [ ] Sélectionner catégorie **Électricité**, description "Facture Eneo mai", montant **25000**
- [ ] Définir le bénéficiaire "Eneo" et le mode "Mobile Money"
- [ ] Enregistrer → la dépense apparaît dans le tableau avec un badge **orange Électricité**
- [ ] Vérifier le KPI "Total dépenses" qui passe à 25 000 FCFA

### Plusieurs catégories
- [ ] Ajouter au moins 3 dépenses dans 3 catégories différentes
- [ ] Le **camembert** affiche bien les 3 parts avec les bonnes couleurs
- [ ] La légende sous le camembert est lisible
- [ ] Le **KPI "Plus grosse catégorie"** affiche la bonne catégorie

### Filtres et recherche
- [ ] Filtrer par catégorie via le select → ne montre que cette catégorie
- [ ] Rechercher "Eneo" → seules les dépenses avec ce mot apparaissent
- [ ] Tester les 4 boutons de période (Jour / Semaine / Mois / Tout)
- [ ] Le KPI "vs période précédente" affiche un % cohérent

### Modification / Suppression
- [ ] Cliquer l'icône **Édit** → la modal s'ouvre pré-remplie
- [ ] Changer le montant et enregistrer → toast OK, montant à jour
- [ ] Cliquer l'icône **Trash** → modal de confirmation
- [ ] Confirmer → la dépense disparaît, le total se met à jour

### Export
- [ ] Cliquer **Exporter** → un fichier CSV est téléchargé
- [ ] Ouvrir le CSV : toutes les colonnes attendues sont là (date, catégorie, description, etc.)

### Validation
- [ ] Tenter d'ajouter une dépense avec **montant = 0** → refus + message
- [ ] Description vide → refus
- [ ] Description > 200 caractères → tronquée par maxLength

### Permissions
- [ ] Se connecter en **caissier** → l'item "Dépenses" est **invisible** dans le menu
- [ ] Tenter d'accéder à `/depenses` en URL → redirigé (ProtectedRoute)

### Impact sur les Rapports
- [ ] Aller dans **Rapports** → vérifier les KPI **Dépenses** et **Bénéfice net**
- [ ] Ajouter une grosse dépense (ex : 100 000 loyer) → le bénéfice net diminue d'autant
- [ ] Si le bénéfice net devient **négatif**, il s'affiche en **rouge**

### Mode offline
- [ ] Couper le réseau → ajouter une dépense → succès local
- [ ] Rétablir le réseau → vérifier dans Firestore que la dépense est synchronisée

---

## 🚀 Pour pousser sur Git

```bash
# Sauvegarder ton .env d'abord
unzip legwan-v1.1.3-depenses.zip
# Remplacer ton dossier local

git status   # devrait montrer ~7 fichiers modifiés ou nouveaux
git add .
git commit -m "feat(expenses): module dépenses (v1.1.3) — Phase 1 originale complète

- Nouveau store useExpenseStore + schema Zod
- Page Dépenses avec CRUD, filtres, camembert, export CSV
- 12 catégories + 4 modes de paiement
- KPI bénéfice net dans Rapports (CA − COGS − Dépenses)
- 21 nouveaux tests
- Fix: doublon import DepensesPage dans App.tsx

351 / 351 tests passent. Voir CHANGELOG-v1.1.3.md."

git push origin main
```

---

## 🎉 Étape importante : la v1.1 est COMPLÈTE

La **Phase 1 originale** (Clients + Crédit + Dépenses) est terminée. Tu peux **mettre Legwan en production maintenant** chez tes premiers utilisateurs :
- Le produit a rattrapé Loyverse/Hiboutik sur le terrain africain
- Tu as 3 différenciateurs réels : crédit structuré, fichier clients par téléphone, suivi du bénéfice net
- 351 tests assurent la non-régression

**Recommandation forte** : prends 1-2 semaines avant d'enchaîner sur v1.2 pour :
1. Tester en conditions réelles dans 2-3 boutiques pilotes
2. Recueillir les retours sur ces 3 modules
3. Ajuster ce qui ne va pas avant d'empiler du nouveau code

C'est ce qui fera la différence entre "POS techniquement parfait" et "POS que les boutiques adorent vraiment".

---

## ➡️ Prochaines étapes possibles

### Option A : Mise en prod et retours utilisateurs (recommandée)
Tu déploies v1.1 chez tes pilotes, tu observes l'usage réel, tu collectes les irritants. On reprend ensuite avec les vrais besoins terrain.

### Option B : Continuer la Phase 1 élargie (techniquement)
- **v1.2** : Prix négociable Premium + Sessions de caisse (4-5 fichiers à coder)
- **v1.3** : Inventaire & Réconciliation (5-6 fichiers à coder)

### Option C : Hybride
Déployer v1.1 ET commencer v1.2 en parallèle. Si tes pilotes adorent, v1.2 sera prête. Si tu dois ajuster, tu auras encore le temps.

Quand tu auras testé v1.1.3 et que tout va bien, dis-moi **"Option A"**, **"Option B"** ou **"Option C"** et on attaque.
