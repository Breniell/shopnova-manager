# ShopNova Manager - Guide de Migration Design

## Vue d ensemble
Ce guide detaille les changements a apporter aux pages pour implementer
le nouveau design system "The Tactile Architect".

## Changements principaux

### 1. Suppression des borders
AVANT: <div className="border border-gray-200">
APRES: <div className="surface-container-lowest">

### 2. Nouvelles couleurs
AVANT: bg-[#6C63FF] (violet)
APRES: bg-primary-500 (terra cotta #A93200)

### 3. Nouveaux composants
- <StatusBadge status="healthy" /> - Badges de stock
- <PaymentBadge mode="mobile_money" operator="mtn" /> - Paiements
- <ProgressBar value={85} max={100} /> - Barres de progression
- <TactileCard level={2}> - Cards sans borders

## Ordre de migration recommande

1. LoginPage.tsx
2. DashboardPage.tsx
3. CaissePage.tsx
4. StockPage.tsx
5. Autres pages...

Consultez SHOPNOVA-REFONTE-COMPLETE.md pour des exemples detailles.
