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
  getIdTokenResult,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  auth,
  isFirebaseConfigured,
  disableFirebaseForLocalMode,
  enableFirebaseAfterLocalMigration,
  getFirebaseRuntimeConfig,
} from '@/lib/firebase';

let _boutiqueId: string | null = null;
const RECOVERY_EMAIL_KEY = 'legwan-recovery-email';
const REGISTER_CODE_KEY = 'legwan-register-code';
const BOUTIQUE_ID_KEY = 'legwan-boutique-id';

function cacheBoutiqueId(boutiqueId: string): string {
  _boutiqueId = boutiqueId;
  try { localStorage.setItem(BOUTIQUE_ID_KEY, boutiqueId); } catch { /* storage unavailable */ }
  return boutiqueId;
}

function getCachedBoutiqueId(): string | null {
  try { return localStorage.getItem(BOUTIQUE_ID_KEY); } catch { return null; }
}

/** Stable namespace for tenant-isolated local snapshots. */
export function getLocalSnapshotTenantId(): string {
  return getCachedBoutiqueId() ?? 'unregistered';
}

function isDefinitelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function activateLocalOfflineBoutique(): string | null {
  const cachedId = getCachedBoutiqueId();
  if (cachedId) {
    // Keep Firebase enabled for an already-known cloud tenant. Firestore can
    // durably queue offline mutations and sync them after Auth is restored.
    // Disabling it here would turn service writes into successful no-ops.
    return cacheBoutiqueId(cachedId);
  }

  // A genuinely new offline installation has no authenticated cloud target.
  // Keep it autonomous until the explicit local-to-cloud migration workflow.
  disableFirebaseForLocalMode();
  return cacheBoutiqueId(`local-${crypto.randomUUID()}`);
}

/**
 * Code de caisse stable, propre à cette installation (cet appareil).
 *
 * Généré une seule fois au premier lancement et conservé localement. Il sert
 * à préfixer les numéros de vente afin qu'ils restent uniques même lorsque
 * plusieurs caisses d'une même boutique tournent en parallèle hors-ligne :
 * deux appareils peuvent atteindre le compteur 42 sans collision, car leurs
 * numéros diffèrent par ce préfixe (ex. LGW-2026-A1B2-00042 vs LGW-2026-C3D4-00042).
 */
export function getRegisterCode(): string {
  try {
    let code = localStorage.getItem(REGISTER_CODE_KEY);
    if (!code) {
      const bytes = new Uint8Array(2);
      crypto.getRandomValues(bytes);
      code = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      localStorage.setItem(REGISTER_CODE_KEY, code);
    }
    return code;
  } catch {
    return 'XXXX';
  }
}

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

async function resolveAuthenticatedBoutiqueId(user: FirebaseUser): Promise<string> {
  try {
    const token = await getIdTokenResult(user);
    const claimedBoutiqueId = token.claims.boutiqueId;
    if (typeof claimedBoutiqueId === 'string' && claimedBoutiqueId && !claimedBoutiqueId.startsWith('local-')) {
      return claimedBoutiqueId;
    }
  } catch {
    // Cached tenant is the safe offline fallback for an employee-bound device.
    const cached = getCachedBoutiqueId();
    if (cached) return cached;
  }
  return user.uid;
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
  cacheBoutiqueId(linked.user.uid);
  localStorage.setItem(RECOVERY_EMAIL_KEY, normalizedEmail);
  return linked.user.uid;
}

export async function signInBoutiqueRecoveryAccount(email: string, password: string): Promise<string> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase n est pas configure. Ajoutez les variables Firebase dans .env.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  const uid = credential.user.uid;

  console.log('[Restore] Authentification Firebase reussie (UID:', uid, '). Verification des donnees boutique…');

  // Verify that this account actually owns boutique data in Firestore.
  // Without this check, a successful sign-in on an account with no associated boutique
  // silently reloads into an empty login screen with no error message.
  const { fsIsBoutiqueInitialized } = await import('@/services/firestoreService');
  let boutiqueExists: boolean;
  try {
    boutiqueExists = await fsIsBoutiqueInitialized(uid);
  } catch (err) {
    console.error('[Restore] Impossible de lire la boutique dans Firestore (UID:', uid, '):', err);
    await auth.signOut().catch(() => {});
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'permission-denied' || code === 'PERMISSION_DENIED') {
      throw new Error(
        'Acces refuse par Firestore (permission-denied). Verifiez que les regles de securite Firebase sont bien deployees et que le compte est correct.'
      );
    }
    throw new Error(
      'Impossible de verifier la boutique. Verifiez votre connexion internet et reessayez.'
    );
  }

  if (!boutiqueExists) {
    console.error('[Restore] Aucune donnee boutique dans Firestore pour UID:', uid,
      '— compte non lie a une boutique, ou mauvaise adresse email.');
    await auth.signOut().catch(() => {});
    throw new Error(
      "Aucune boutique associee a ce compte. Verifiez votre adresse email — ce compte n'a peut-etre pas encore ete lie a une boutique via les Parametres."
    );
  }

  console.log('[Restore] Boutique verifiee. Rechargement de l\'application…');
  cacheBoutiqueId(uid);
  localStorage.setItem(RECOVERY_EMAIL_KEY, normalizedEmail);
  localStorage.removeItem('legwan-auth');
  return uid;
}

/**
 * Final attachment step for a completed local-to-cloud migration. It changes
 * no local tenant state until the default Firebase Auth proves the target UID.
 */
export async function finalizeLocalToCloudMigrationAccount(
  email: string,
  password: string,
  expectedBoutiqueId: string,
): Promise<string> {
  if (!getFirebaseRuntimeConfig()) throw new Error('Firebase n est pas configure sur cette installation.');
  const normalizedEmail = email.trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  if (credential.user.uid !== expectedBoutiqueId) {
    await auth.signOut().catch(() => {});
    throw new Error('Le compte authentifie ne correspond pas a la boutique migree.');
  }

  // Only now is it safe for the default app to leave autonomous local mode.
  enableFirebaseAfterLocalMigration();
  cacheBoutiqueId(expectedBoutiqueId);
  localStorage.setItem(RECOVERY_EMAIL_KEY, normalizedEmail);
  localStorage.removeItem('legwan-auth');
  return expectedBoutiqueId;
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
    return cacheBoutiqueId(getCachedBoutiqueId() ?? 'local-boutique');
  }

  const cachedId = getCachedBoutiqueId();
  if (cachedId?.startsWith('local-')) {
    disableFirebaseForLocalMode();
    return cacheBoutiqueId(cachedId);
  }

  // Wait for Firebase to restore auth state from cache
  await auth.authStateReady();

  if (auth.currentUser) {
    return cacheBoutiqueId(await resolveAuthenticatedBoutiqueId(auth.currentUser));
  }

  // A UID is an identifier, not an authentication credential. If Firebase no
  // longer restores the session of an existing installation, never create a
  // different anonymous tenant silently: explicit account recovery is needed.
  if (cachedId) {
    const error = new Error(
      isDefinitelyOffline()
        ? 'Session Firebase locale indisponible hors connexion.'
        : 'Session Firebase locale perdue. Restaurez la boutique avec son compte de récupération.',
    );
    (error as Error & { code: string }).code = 'auth/local-session-missing';
    throw error;
  }

  // Anonymous Auth cannot create the first Firebase account without a network.
  if (isDefinitelyOffline()) {
    const error = new Error('Connexion indisponible : première identification Firebase impossible.');
    (error as Error & { code: string }).code = 'auth/network-request-failed';
    throw error;
  }

  const credential = await signInAnonymously(auth);
  return cacheBoutiqueId(credential.user.uid);
}
