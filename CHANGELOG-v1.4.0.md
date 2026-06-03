# Legwan v1.4.0 — Changelog

**Date de release :** 3 juin 2026

---

## Nouveautés majeures

### Console Super-Admin (développeur)
- Nouvelle route cachée `/superadmin` dans l'application Electron
- Authentification par compte Firebase Email/Password (instance isolée — session boutique non impactée)
- **Vue globale** : 7 KPIs agrégés (installations actives, CA total, utilisateurs, produits, etc.)
- **Carte interactive** : marqueurs SVG Legwan personnalisés avec statut couleur (vert/orange/rouge selon activité), clusters automatiques, heatmap CA par boutique
- **Liste boutiques** : tableau trié/filtrable avec CA, nb ventes, version, dernière activité
- Géolocalisation automatique des boutiques via Nominatim (adresse → coordonnées GPS)
- Heartbeat automatique : chaque installation rapporte ses stats agrégées à `platform/registry/{boutiqueId}`

### Création du compte administrateur à l'installation
- La politique de confidentialité inclut maintenant une **phase 2** (nouvelles installations uniquement)
- L'installateur crée son propre compte gérant (prénom, nom, PIN 4 chiffres) via un pavé numérique
- Ce compte devient le gérant principal de la boutique — les comptes de démo (Marie/Paul/Fatou) ne sont plus créés automatiquement

---

## Corrections de sécurité

### [CRITIQUE] Sel PIN par utilisateur
- Remplacement du sel global partagé (`shopnova-salt-2026`) par un sel aléatoire 128 bits par utilisateur
- Migration transparente : les utilisateurs existants sont migrés au prochain login sans interruption
- La compromission d'un compte ne permet plus de déchiffrer les autres

### [CRITIQUE] Initialisation Firebase corrigée
- `fsInitializeBoutique()` n'était jamais appelé sur une nouvelle installation
- Conséquence : les données étaient perdues à chaque redémarrage (re-seed des comptes de démo)
- Corrigé : les données sont maintenant écrites en Firestore dès le premier lancement

### [MOYEN] IDs utilisateurs non prédictibles
- `Date.now().toString()` remplacé par `crypto.randomUUID()`

### [FAIBLE] Confirmation avant suppression d'utilisateur
- Une modale de confirmation est maintenant affichée avant la suppression d'un compte caissier

---

## Corrections de couleurs et UX

- Palette de couleurs dans la création d'utilisateur : `#6C63FF` (violet) remplacé par `#A93200` (terra cotta primaire)

---

## Infrastructure

- Ajout de `firebase.json`, `.firebaserc`, `firestore.indexes.json` pour le déploiement Firebase CLI
- Règles Firestore mises à jour : collection `platform/registry` avec isolation lecture/écriture
- Instance Firebase secondaire (`legwan-superadmin`) pour l'auth super-admin
- Politique de confidentialité v1.4.0 : mention du monitoring développeur (stats agrégées anonymisées)

---

## Migration

### Utilisateurs existants
- Les PINs sont migrés automatiquement au premier login (aucune action requise)
- La session reste active — pas de déconnexion forcée

### Nouvelles installations
- L'installateur crée son compte gérant lors de la première ouverture
- Les comptes de démo ne sont plus créés (sauf en mode développement sans Firebase)

---

## Commandes de déploiement

```bash
# Déployer les règles Firestore
firebase deploy --only firestore:rules

# Builder et publier
npm run electron:dist
```
