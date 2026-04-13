import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
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

// ─── Lazy initialization — only runs when credentials are present ─────────────
// When isFirebaseConfigured is false, auth and db are stubs that are never
// actually called (every service function guards with `if (!isFirebaseConfigured) return`).

let _auth: Auth;
let _db: Firestore;

if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  };

  // Avoid double-initialization in hot-reload
  const app: FirebaseApp = getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig);

  _auth = getAuth(app);

  try {
    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Already initialized (hot reload)
    _db = getFirestore(app);
  }
} else {
  // Stubs — never actually called since all service functions guard with
  // `if (!isFirebaseConfigured) return` before touching auth or db.
  _auth = null as unknown as Auth;
  _db   = null as unknown as Firestore;
}

export const auth = _auth;
export const db   = _db;
