# Legwan — Générateur de licences

Script Node.js autonome pour créer et signer des licences Ed25519.  
**Ce dossier ne doit jamais être importé depuis `src/`.**

---

## Initialisation (une seule fois par déploiement)

```bash
cd scripts/license-gen
node generate.mjs --init
```

Cela :
1. Génère une paire de clés Ed25519 (PKCS8 privée + SPKI publique).
2. Écrit `license-private.pem` localement (droits 600).
3. Affiche la clé publique à coller dans `.env` :

```
VITE_LICENSE_PUBKEY=MCowBQYDK2VwAyEA...
```

### ⚠️ Sauvegardez la clé privée immédiatement

- Copiez `license-private.pem` dans votre **gestionnaire de mots de passe** (Bitwarden, 1Password…).
- Copiez-le aussi sur une **clé USB chiffrée** stockée hors du PC (coffre, tiroir verrouillé…).
- **La perte de cette clé = impossible d'émettre de nouvelles licences.**  
- **Sa fuite = n'importe qui peut signer des licences. Modèle économique cassé.**

---

## Émettre une licence

```bash
node generate.mjs \
  --boutique abc123-boutique-id \
  --plan standard \
  --days 365 \
  --name "Kouassi Jean" \
  --contact "+225 07 XX XX XX"
```

```bash
# Licence d'essai (30 jours)
node generate.mjs --boutique abc123 --plan trial --days 30
```

La commande imprime la chaîne `LGW1-…` à envoyer au client (WhatsApp, SMS, e-mail).

### Paramètres

| Option | Requis | Description |
|---|---|---|
| `--boutique <id>` | ✅ | Boutique ID (visible dans Paramètres → Boutique) |
| `--plan trial\|standard` | ✅ | Type de licence |
| `--days <n>` | ✅ | Durée en jours (≥ 1) |
| `--name <nom>` | — | Nom du titulaire (stocké dans le payload) |
| `--contact <contact>` | — | Contact / WhatsApp du titulaire |

---

## Format de la licence

```
LGW1-<base64url(UTF-8(JSON(payload)))>.<base64url(signature Ed25519)>
```

- **Préfixe `LGW1-`** : identification visuelle immédiate.  
- **Payload** : JSON compact de `LicensePayload` (voir `src/lib/license/types.ts`).  
- **Signature** : Ed25519 brut (64 octets), couvrant les octets UTF-8 du JSON.  
- **Clé publique** : SPKI DER 44 octets encodé base64 standard, dans `VITE_LICENSE_PUBKEY`.

---

## Test d'intégration CLI ↔ app

1. Générez une licence avec le CLI :
   ```bash
   node generate.mjs --boutique <id> --plan trial --days 30
   ```
2. Dans la console navigateur (ou un test Node), appelez `verifyLicenseRaw` avec :
   - la chaîne générée
   - `pubkeySpkiB64` = valeur de `VITE_LICENSE_PUBKEY`
   - `boutiqueId` = même `<id>`
   - `now` = `Date.now()`
3. Résultat attendu : `{ valid: true, payload: { plan: 'trial', … } }`.

---

## Sécurité — rappel

- `license-private.pem` est bloqué par `.gitignore` (`*.pem`).  
- Ne jamais copier la clé privée dans `src/`, dans un `.env` commité, ou dans Firestore.  
- La clé publique dans `VITE_LICENSE_PUBKEY` est **publique** — aucun risque à la commiter dans `.env.example`.
