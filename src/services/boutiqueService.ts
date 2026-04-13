/**
 * Boutique identity management.
 *
 * Each physical installation gets a unique, permanent ID via Firebase Anonymous Auth.
 * The UID is generated once (first launch), persisted by the Firebase SDK,
 * and used as the Firestore tenant key: boutiques/{boutiqueId}/...
 *
 * If the device is reinstalled or the browser data is cleared, a new ID is generated
 * and the cloud data can be recovered by contacting support (or re-linking via the UID).
 */
import { signInAnonymously } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';

let _boutiqueId: string | null = null;

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
