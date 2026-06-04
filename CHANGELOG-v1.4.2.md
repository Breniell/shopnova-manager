# Legwan v1.4.2 — Sécurité & Scalabilité

**Date :** 4 juin 2026

---

## Corrections de sécurité (White Hat Pentest)

### [CRITIQUE] Brute-force PIN via effacement localStorage — CORRIGÉ
- **Avant** : effacer localStorage réinitialisait le compteur de blocage → brute-force des 10 000 PINs possible
- **Après** : compteur stocké dans Firestore `boutiques/{id}/security/loginAttempts`, inviolable localement

### [CRITIQUE] Hachage PIN SHA-256 → PBKDF2 200 000 itérations — CORRIGÉ
- **Avant** : SHA-256 = 0,001ms/tentative sur GPU → 10 000 PINs craqués en 10ms
- **Après** : PBKDF2-SHA-256 200k itérations = 300ms/tentative → brute-force = 50 minutes minimum
- Migration transparente : les utilisateurs existants migrent automatiquement au prochain login

### [HAUTE] XSS dans l'export PDF — CORRIGÉ
- Noms de produits/clients avec balises HTML injectées dans la fenêtre d'impression
- `escapeHtml()` appliqué sur toutes les cellules avant construction du HTML

### [HAUTE] Injection de formules CSV — CORRIGÉE
- Cellules commençant par `=`, `+`, `-`, `@`, `|` interprétées comme formules dans Excel
- Préfixe `'` automatique sur toutes les valeurs dangereuses

---

## Scalabilité

### Pagination des ventes Firestore — IMPLÉMENTÉE
- Avant : chargement de TOUTES les ventes → quota Firestore dépassé dès 5 000 ventes
- Après : uniquement les 90 derniers jours + limite 2 000 documents
- L'historique complet reste accessible via le cache IndexedDB offline

---

## Corrections

### Intégrité de session au démarrage
- Un `currentUser` persisté en localStorage dont l'ID n'existe plus dans Firestore force une déconnexion propre

### Validation des données registre (Firestore rules)
- `nom ≤ 200`, `adresse ≤ 500`, `telephone ≤ 50` caractères maximum

### Édition des utilisateurs
- Nouveau bouton "Modifier" dans Paramètres → Utilisateurs pour changer prénom, nom et rôle
- Les gérants peuvent désormais être supprimés s'il en reste au moins un autre

---

## Autres améliorations (v1.4.1)

- **Ctrl+Shift+Alt+A** : accès direct à la console super-admin depuis l'app Electron
- **Ctrl+Shift+Alt+H** : retour au login boutique depuis le super-admin
