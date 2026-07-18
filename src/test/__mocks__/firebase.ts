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
export const getIdTokenResult = async () => ({ claims: {} });
export const signInWithEmailAndPassword = async () => ({ user: { uid: 'test-boutique-id', email: 'test@example.com', isAnonymous: false } });
export const linkWithCredential = async (user: unknown) => ({ user });
export const sendPasswordResetEmail = async () => {};
export const EmailAuthProvider = {
  credential: (email: string, password: string) => ({ email, password }),
};

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
export const getDocFromCache = getDoc;
export const getDocsFromCache = getDocs;
export const setDoc = async () => {};
export const updateDoc = async () => {};
export const deleteDoc = async () => {};

export const writeBatch = () => ({
  set: () => {},
  update: () => {},
  delete: () => {},
  commit: async () => {},
});

export const increment = (n: number) => ({ __increment: n });

export const where = () => ({});
export const limit = () => ({});

export const Timestamp = {
  now: () => ({ toDate: () => new Date(), seconds: 0, nanoseconds: 0 }),
  fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
};
