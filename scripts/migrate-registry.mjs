/**
 * migrate-registry.mjs
 *
 * One-time migration: remove the `stats` field from all existing Firestore
 * registry documents. After Ticket 8, the heartbeat no longer writes `stats`
 * — only `health` is written. Running this script cleans up legacy data so
 * that the SA console no longer reads stale financial figures.
 *
 * Prerequisites:
 *   npm install -g firebase-admin   (or install locally in this package)
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 *
 * Usage:
 *   node scripts/migrate-registry.mjs [--dry-run]
 *
 * Flags:
 *   --dry-run   Print affected documents without actually deleting the field.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const COLLECTION = 'registry';

// ─── Firebase init ────────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length > 0) return;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS env var is not set.\n' +
      'Generate a service account key from Firebase Console → Project settings → Service accounts.'
    );
  }

  const serviceAccount = JSON.parse(readFileSync(resolve(credPath), 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
}

// ─── Migration ────────────────────────────────────────────────────────────────

async function migrate() {
  initFirebase();
  const db = getFirestore();

  console.log(`[migrate-registry] Fetching all documents in "${COLLECTION}"…`);
  const snapshot = await db.collection(COLLECTION).get();

  if (snapshot.empty) {
    console.log('[migrate-registry] Collection is empty — nothing to do.');
    return;
  }

  let affected = 0;
  let skipped  = 0;

  const batch = db.batch();

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();

    if (!Object.prototype.hasOwnProperty.call(data, 'stats')) {
      skipped++;
      continue;
    }

    affected++;
    console.log(
      `  ${DRY_RUN ? '[DRY-RUN] would update' : 'updating'}: ${docSnap.id}` +
      ` (stats keys: ${Object.keys(data.stats ?? {}).join(', ')})`
    );

    if (!DRY_RUN) {
      batch.update(docSnap.ref, { stats: FieldValue.delete() });
    }
  }

  if (affected === 0) {
    console.log('[migrate-registry] No documents with a "stats" field — already clean.');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[migrate-registry] DRY-RUN complete. ${affected} document(s) would be updated, ${skipped} skipped.`);
    return;
  }

  await batch.commit();
  console.log(`\n[migrate-registry] Done. ${affected} document(s) updated, ${skipped} skipped.`);
}

migrate().catch(err => {
  console.error('[migrate-registry] Fatal error:', err);
  process.exit(1);
});
