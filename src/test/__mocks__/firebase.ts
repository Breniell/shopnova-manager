/**
 * Firebase mock for Vitest — replaces all firebase/* imports in tests.
 * All functions are no-ops or return minimal stubs.
 */

// firebase/app
export const initializeApp = () => ({});
export const getApps = () => [];

// firebase/auth
export const getAuth = () => ({ authStateReady: async () => {}, currentUser: null });
export const signInAnonymously = async () => ({ user: { uid: 'test-boutique-id' } });

// firebase/firestore
export const CACHE_SIZE_UNLIMITED = Infinity;
export const initializeFirestore = () => ({});
export const getFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const persistentSingleTabManager = () => ({});

export const doc = () => ({});
export const collection = () => ({});
export const query = (...args: unknown[]) => args[0];
export const orderBy = () => ({});

export const getDoc = async () => ({ exists: () => false, data: () => null });
export const getDocs = async () => ({ docs: [] });
export const setDoc = async () => {};
export const updateDoc = async () => {};
export const deleteDoc = async () => {};

export const writeBatch = () => ({
  set: () => {},
  delete: () => {},
  commit: async () => {},
});

export const Timestamp = {
  now: () => ({ toDate: () => new Date(), seconds: 0, nanoseconds: 0 }),
  fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
};
