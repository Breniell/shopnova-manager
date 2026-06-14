#!/usr/bin/env node
/**
 * Legwan — générateur de licences Ed25519
 *
 * USAGE :
 *   node generate.mjs --init
 *   node generate.mjs --boutique <id> --plan trial|standard --days <n>
 *                     [--name "Nom titulaire"] [--contact "WhatsApp/email"]
 *   node generate.mjs --help
 *
 * SÉCURITÉ : Ce script NE DOIT JAMAIS être importé depuis src/.
 *            La clé privée (license-private.pem) reste sur cette machine uniquement.
 */

import { createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_FILE  = resolve(__dirname, 'license-private.pem');
const PREFIX    = 'LGW1-';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** base64url encode (no padding). Buffer.toString('base64url') requires Node 14+. */
function b64u(buf) {
  return Buffer.from(buf).toString('base64url');
}

// ─── --init ───────────────────────────────────────────────────────────────────

function init() {
  if (existsSync(KEY_FILE)) {
    console.error('❌  license-private.pem already exists.');
    console.error('    Supprimez-le manuellement si vous voulez vraiment régénérer.');
    console.error('    ⚠️  Régénérer invalide TOUTES les licences existantes !');
    process.exit(1);
  }

  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  });

  writeFileSync(KEY_FILE, privateKey, { encoding: 'utf8', mode: 0o600 });

  // Export SPKI DER → base64 (standard, with padding) for VITE_LICENSE_PUBKEY
  const spkiDer   = createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  const pubkeyB64 = spkiDer.toString('base64');

  console.log('');
  console.log('✅  license-private.pem généré (droits 600).');
  console.log('');
  console.log('📋  Collez ceci dans votre .env et .env.production :');
  console.log('');
  console.log(`    VITE_LICENSE_PUBKEY=${pubkeyB64}`);
  console.log('');
  console.log('⚠️   SAUVEGARDEZ license-private.pem dans un gestionnaire de mots de passe');
  console.log('    ET sur une clé USB chiffrée stockée hors site.');
  console.log('    La perte de cette clé = impossible d\'émettre de nouvelles licences.');
  console.log('    Sa fuite = modèle économique cassé.');
}

// ─── generate licence ─────────────────────────────────────────────────────────

function generateLicense({ boutiqueId, plan, days, name, contact }) {
  if (!existsSync(KEY_FILE)) {
    console.error('❌  license-private.pem introuvable. Exécutez --init d\'abord.');
    process.exit(1);
  }

  const privateKeyPem = readFileSync(KEY_FILE, 'utf8');
  const now           = Date.now();

  const payload = {
    v:         1,
    licenseId: randomUUID(),
    boutiqueId,
    plan,
    issuedAt:  now,
    expiresAt: now + days * 24 * 60 * 60 * 1000,
    machineId: null,
    ...(name || contact
      ? { holder: Object.fromEntries([['name', name], ['contact', contact]].filter(([, v]) => v != null)) }
      : {}),
  };

  // Message to sign = UTF-8 bytes of the compact JSON
  // The browser verifier decodes the exact same bytes from the licence string.
  const payloadJson  = JSON.stringify(payload);
  const payloadBytes = Buffer.from(payloadJson, 'utf8');

  // Ed25519: null algorithm = raw Ed25519 (Node convention)
  const signature = sign(null, payloadBytes, privateKeyPem);

  const licenseStr = `${PREFIX}${b64u(payloadBytes)}.${b64u(signature)}`;

  const expiresDate = new Date(payload.expiresAt).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  console.log('');
  console.log('✅  Licence générée :');
  console.log('');
  console.log(licenseStr);
  console.log('');
  console.log('📋  Métadonnées :');
  console.log(`    licenseId  : ${payload.licenseId}`);
  console.log(`    plan       : ${plan}`);
  console.log(`    boutiqueId : ${boutiqueId}`);
  console.log(`    expire le  : ${expiresDate}`);
  if (name)    console.log(`    titulaire  : ${name}`);
  if (contact) console.log(`    contact    : ${contact}`);
  console.log('');
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const has  = f => argv.includes(f);
const get  = f => { const i = argv.indexOf(f); return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined; };

if (argv.length === 0 || has('--help') || has('-h')) {
  console.log(`
Legwan License Generator

USAGE :
  node generate.mjs --init
      Génère une paire de clés Ed25519 (une seule fois par déploiement).

  node generate.mjs --boutique <id> --plan trial|standard --days <n>
                    [--name "Nom"] [--contact "WhatsApp/email"]
      Génère une chaîne de licence prête à envoyer.

OPTIONS :
  --init                Initialiser la paire de clés
  --boutique <id>       Boutique ID (visible dans Paramètres → Boutique)
  --plan <plan>         trial | standard
  --days <n>            Durée de validité en jours (ex. : 30, 365)
  --name <nom>          Nom du titulaire (optionnel)
  --contact <contact>   Contact / WhatsApp du titulaire (optionnel)
  --help                Afficher cette aide
`);
  process.exit(0);
}

if (has('--init')) {
  init();
} else {
  const boutiqueId = get('--boutique');
  const plan       = get('--plan');
  const daysRaw    = get('--days');
  const name       = get('--name');
  const contact    = get('--contact');

  const errors = [];
  if (!boutiqueId)                                  errors.push('--boutique <id> requis');
  if (!plan || !['trial', 'standard'].includes(plan)) errors.push('--plan trial|standard requis');
  const days = parseInt(daysRaw ?? '', 10);
  if (!daysRaw || isNaN(days) || days < 1)          errors.push('--days <n> doit être un entier ≥ 1');

  if (errors.length) {
    errors.forEach(e => console.error(`❌  ${e}`));
    console.error('\nLancez --help pour la documentation.');
    process.exit(1);
  }

  generateLicense({ boutiqueId, plan, days, name, contact });
}
