import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

/** True if Firebase credentials are present in the environment */
export const isFirebaseConfigured = !!(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID
);

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
    });
  } catch {
    _db = getFirestore(app);
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
    _saDb   = getFirestore(saApp);
  }

  return { saAuth: _saAuth, saDb: _saDb };
}
