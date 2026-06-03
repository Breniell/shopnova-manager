/**
 * Boutique identity management.
 *
 * Each physical installation gets a unique, permanent ID via Firebase Anonymous Auth.
 * The UID is generated once (first launch), persisted by the Firebase SDK,
 * and used as the Firestore tenant key: boutiques/{boutiqueId}/...
 *
 * The anonymous account can be linked to Email/Password so the same UID, and
 * therefore the same Firestore tenant, can be restored on a new machine.
 */
import {
  EmailAuthProvider,
  linkWithCredential,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';

let _boutiqueId: string | null = null;
const RECOVERY_EMAIL_KEY = 'legwan-recovery-email';

export interface BoutiqueRecoveryStatus {
  boutiqueId: string;
  codeCourt: string;
  email: string | null;
  isFirebaseConfigured: boolean;
  isLocalMode: boolean;
  isAnonymous: boolean;
  isRecoveryEnabled: boolean;
}

/**
 * Returns the cached boutiqueId synchronously.
 *
 * When Firebase is not configured (dev/test/offline mode), returns a stable
 * local ID. All Firestore write functions are no-ops in that case, so this
 * value is never actually sent to Firebase.
 */
export function getBoutiqueId(): string {
  if (!isFirebaseConfigured) return _boutiqueId ?? 'local-boutique';
  if (!_boutiqueId) throw new Error('Firebase not initialized. Call initBoutique() first.');
  return _boutiqueId;
}

/**
 * Initializes Firebase Anonymous Auth and returns the permanent boutique ID.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
/**
 * Returns a short human-readable code derived from the boutiqueId.
 * Used for boutique recovery and identification.
 * Format: first 8 characters uppercased (e.g. "A1B2C3D4").
 */
export function getBoutiqueCode(boutiqueId: string): string {
  return boutiqueId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function getSavedRecoveryEmail(): string {
  return localStorage.getItem(RECOVERY_EMAIL_KEY) ?? '';
}

export function getBoutiqueRecoveryErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'Cet email est deja lie a une autre boutique. Utilisez un autre email ou restaurez cette boutique depuis l ecran de connexion.';
    case 'auth/invalid-email':
      return 'Adresse email invalide.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email ou mot de passe incorrect.';
    case 'auth/operation-not-allowed':
      return 'Firebase Email/Password n est pas active. Activez Authentication > Sign-in method > Email/Password dans Firebase.';
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 6 caracteres.';
    case 'auth/network-request-failed':
      return 'Connexion internet indisponible. Reessayez quand le reseau est revenu.';
    case 'auth/requires-recent-login':
      return 'Pour securite, reconnectez-vous a Firebase puis recommencez.';
    default:
      return error instanceof Error ? error.message : 'Erreur inconnue.';
  }
}

async function getCurrentFirebaseUser(): Promise<FirebaseUser | null> {
  if (!isFirebaseConfigured) return null;
  await auth.authStateReady();
  return auth.currentUser;
}

export async function getBoutiqueRecoveryStatus(): Promise<BoutiqueRecoveryStatus> {
  const boutiqueId = getBoutiqueId();
  const user = await getCurrentFirebaseUser();
  const savedEmail = getSavedRecoveryEmail();

  return {
    boutiqueId,
    codeCourt: getBoutiqueCode(boutiqueId),
    email: user?.email ?? (savedEmail || null),
    isFirebaseConfigured,
    isLocalMode: !isFirebaseConfigured || boutiqueId === 'local-boutique' || boutiqueId.startsWith('local-'),
    isAnonymous: user?.isAnonymous ?? !isFirebaseConfigured,
    isRecoveryEnabled: !!user && !user.isAnonymous && !!user.email,
  };
}

export async function linkBoutiqueRecoveryAccount(email: string, password: string): Promise<string> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase n est pas configure. Ajoutez les variables Firebase dans .env.');
  }

  if (password.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caracteres.');
  }

  await initBoutique();
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur Firebase introuvable.');

  const normalizedEmail = email.trim().toLowerCase();
  const credential = EmailAuthProvider.credential(normalizedEmail, password);

  if (!user.isAnonymous) {
    if (user.email?.toLowerCase() === normalizedEmail) {
      localStorage.setItem(RECOVERY_EMAIL_KEY, normalizedEmail);
      return user.uid;
    }
    throw new Error('Cette boutique a deja un autre email de recuperation.');
  }

  const linked = await linkWithCredential(user, credential);
  _boutiqueId = linked.user.uid;
  localStorage.setItem(RECOVERY_EMAIL_KEY, normalizedEmail);
  return _boutiqueId;
}

export async function signInBoutiqueRecoveryAccount(email: string, password: string): Promise<string> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase n est pas configure. Ajoutez les variables Firebase dans .env.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  _boutiqueId = credential.user.uid;
  localStorage.setItem(RECOVERY_EMAIL_KEY, normalizedEmail);
  localStorage.removeItem('legwan-auth');
  return _boutiqueId;
}

export async function sendBoutiqueRecoveryPasswordReset(email: string): Promise<void> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase n est pas configure. Ajoutez les variables Firebase dans .env.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  await sendPasswordResetEmail(auth, normalizedEmail);
  localStorage.setItem(RECOVERY_EMAIL_KEY, normalizedEmail);
}

export async function initBoutique(): Promise<string> {
  if (_boutiqueId) return _boutiqueId;

  if (!isFirebaseConfigured) {
    // Offline-only mode: use a stable local ID
    _boutiqueId = localStorage.getItem('legwan-boutique-id') ?? 'local-boutique';
    if (!localStorage.getItem('legwan-boutique-id')) {
      localStorage.setItem('legwan-boutique-id', _boutiqueId);
    }
    return _boutiqueId;
  }

  // Wait for Firebase to restore auth state from cache
  await auth.authStateReady();

  if (auth.currentUser) {
    _boutiqueId = auth.currentUser.uid;
  } else {
    const credential = await signInAnonymously(auth);
    _boutiqueId = credential.user.uid;
  }

  return _boutiqueId;
}
