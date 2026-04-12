import { initializeApp, getApps } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  getFirestore,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

/** True if Firebase credentials are present in the environment */
export const isFirebaseConfigured = !!import.meta.env.VITE_FIREBASE_PROJECT_ID;

// Avoid double-initialization in hot-reload
const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Firestore with full IndexedDB offline persistence.
// When Firebase is not configured (tests, offline-only mode), fall back to a
// basic Firestore instance that will never actually be called (all service
// functions guard with `if (!isFirebaseConfigured) return`).
export const db = (() => {
  if (!isFirebaseConfigured) return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Already initialized (hot reload) — return the existing instance
    return getFirestore(app);
  }
})();
