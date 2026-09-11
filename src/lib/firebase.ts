import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

/**
 * Route Firebase at the local emulator suite instead of the real project.
 *
 * Two conditions, and `import.meta.env.DEV` is the one that matters. Vite
 * replaces it with the literal `false` in every production build, so the whole
 * branch below is dead code that the minifier removes and tree-shaking then
 * drops `connectFirestoreEmulator` and `connectAuthEmulator` with it. A shipped
 * installer therefore cannot contain emulator wiring at all, whatever any
 * environment variable says at runtime. src/test/lib/firebase-no-emulator.test.ts
 * asserts exactly that against the real production bundle.
 *
 * The second condition keeps ordinary `npm run dev` pointed at the real project,
 * which is what a developer expects unless they explicitly asked otherwise.
 *
 * Firestore listens on 8181 rather than its default 8080, which the Vite dev
 * server already occupies.
 */
const useFirebaseEmulators = import.meta.env.DEV
  && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_FIRESTORE_PORT = 8181;
const EMULATOR_AUTH_PORT = 9099;

/** True if Firebase credentials are present in the environment */
export let isFirebaseConfigured = !!(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID
);

/** Permanently selects autonomous local mode for the current renderer. */
export function disableFirebaseForLocalMode(): void {
  isFirebaseConfigured = false;
}

/** Runtime config remains available to the isolated migration app in local mode. */
export function getFirebaseRuntimeConfig(): Record<string, string> | null {
  return _firebaseConfig ? { ..._firebaseConfig } : null;
}

/** Call only after the default Auth has successfully signed into the target tenant. */
export function enableFirebaseAfterLocalMigration(): void {
  if (!_firebaseConfig) throw new Error('Firebase runtime configuration unavailable');
  isFirebaseConfigured = true;
}

// ─── Boutique Firebase app (anonymous auth, offline-first Firestore) ──────────

let _auth: Auth;
let _db: Firestore;
let _firebaseConfig: Record<string, string> | null = null;

if (isFirebaseConfigured) {
  _firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  };

  // Avoid double-initialization in hot-reload
  const app: FirebaseApp = getApps().find(a => a.name === '[DEFAULT]')
    ? getApp('[DEFAULT]')
    : initializeApp(_firebaseConfig);

  _auth = getAuth(app);

  try {
    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: persistentMultipleTabManager(),
      }),
      // Several write paths (products, customers, cash sessions...) pass
      // optional fields through as literal `undefined` when unset (e.g.
      // Product.prixCible when negociable is off, the common case). The
      // Firestore SDK rejects `undefined` outright by default, so those
      // writes were silently failing and looping forever in the outbox
      // retry queue since a retry resends the exact same payload. This
      // tells the SDK to drop undefined fields instead of erroring.
      ignoreUndefinedProperties: true,
    });
  } catch {
    _db = getFirestore(app);
  }

  // Must happen before any read or write: both SDKs refuse to switch endpoints
  // once traffic has started, and a late call would leave early writes pointed
  // at the real project.
  if (useFirebaseEmulators) {
    connectAuthEmulator(_auth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
    connectFirestoreEmulator(_db, EMULATOR_HOST, EMULATOR_FIRESTORE_PORT);
    console.info(`[Legwan] Firebase emulators active (firestore:${EMULATOR_FIRESTORE_PORT}, auth:${EMULATOR_AUTH_PORT})`);
  }
} else {
  _auth = null as unknown as Auth;
  _db   = null as unknown as Firestore;
}

export const auth = _auth;
export const db   = _db;

// ─── Super-admin Firebase app (email/password auth, separate instance) ────────
// This second instance uses the same Firebase project but a different Auth
// context so the boutique's anonymous session is never disturbed.

const SA_APP_NAME = 'legwan-superadmin';

let _saAuth: Auth | null = null;
let _saDb: Firestore | null = null;

export function getSuperAdminFirebase(): { saAuth: Auth; saDb: Firestore } | null {
  if (!isFirebaseConfigured || !_firebaseConfig) return null;

  if (!_saAuth || !_saDb) {
    const existing = getApps().find(a => a.name === SA_APP_NAME);
    const saApp = existing ?? initializeApp(_firebaseConfig, SA_APP_NAME);
    _saAuth = getAuth(saApp);
    try {
      _saDb = initializeFirestore(saApp, { ignoreUndefinedProperties: true });
    } catch {
      _saDb = getFirestore(saApp);
    }

    // The super-admin console uses a second Firebase app against the same
    // project, so it needs the same redirection or it would keep reading the
    // real registry while the boutique side talks to the emulator.
    if (useFirebaseEmulators) {
      connectAuthEmulator(_saAuth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
      connectFirestoreEmulator(_saDb, EMULATOR_HOST, EMULATOR_FIRESTORE_PORT);
    }
  }

  return { saAuth: _saAuth, saDb: _saDb };
}
