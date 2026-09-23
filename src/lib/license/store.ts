/**
 * License store - persists the active licence and tamper-resistant timestamps.
 *
 * localStorage keys:
 *   'legwan-license'          raw LGW1-… string (not encrypted - it's just a signed token)
 *   'legwan-install-date'     AES-GCM encrypted ms timestamp of first launch
 *   'legwan-last-seen-time'   AES-GCM encrypted ms timestamp of last confirmed-good time
 *
 * Firestore path: boutiques/{bid}/_license/current
 *   Used to survive a reinstall and to detect revocation set by the super-admin.
 */
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import type { LicensePayload } from './types';

// ─── localStorage keys ────────────────────────────────────────────────────────

export const LICENSE_LS_KEY   = 'legwan-license';
export const INSTALL_DATE_KEY = 'legwan-install-date';
export const LAST_SEEN_KEY    = 'legwan-last-seen-time';
export const REVOKED_LICENSE_KEY = 'legwan-revoked-license-id';

// ─── Key derivation ───────────────────────────────────────────────────────────

// Not a secret - source code is readable. Goal: add meaningful friction against
// trivial localStorage editing (clock cheating / trial extension).
const TS_PASSWORD = 'legwan-ts-guard-v1';
const TS_SALT     = 'lgw-ts-v1';

const keyCache = new Map<string, CryptoKey>();

/**
 * Cle de chiffrement des horodatages.
 *
 * ATTENTION - ne plus jamais faire dependre cette cle du boutiqueId.
 *
 * Elle en dependait, et le boutiqueId n'est pas stable : `LicenseGate` demarre
 * avant que l'authentification anonyme ait abouti, et `getBoutiqueId()` leve
 * alors une exception, rattrapee en `bid = 'local-boutique'`. Un lancement sur
 * deux ecrivait donc l'ancre sous une cle differente, la rendait illisible au
 * lancement suivant - et `getOrCreateInstallDate` traitait « illisible » comme
 * « premiere installation », en accordant 30 jours de plus. En silence.
 *
 * La cle n'a jamais protege un secret : le code source est lisible, elle ne
 * sert qu'a decourager l'edition a la main du stockage local. Une valeur fixe
 * remplit ce role exactement aussi bien, sans perdre l'ancre.
 */
const STABLE_KEY_ID = '__legwan_stable__';

async function deriveKey(keyId: string = STABLE_KEY_ID): Promise<CryptoKey> {
  const cached = keyCache.get(keyId);
  if (cached) return cached;
  const raw = new TextEncoder().encode(TS_PASSWORD + keyId);
  const km  = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(TS_SALT), hash: 'SHA-256', iterations: 10_000 },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(keyId, key);
  return key;
}

async function encryptMs(ms: number, key: CryptoKey): Promise<string> {
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const plain  = new TextEncoder().encode(String(ms));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  const packed = new Uint8Array(12 + cipher.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(cipher), 12);
  return btoa(String.fromCharCode(...packed));
}

async function decryptMs(b64: string, key: CryptoKey): Promise<number | null> {
  try {
    const packed     = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv         = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const plain      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    const n          = parseInt(new TextDecoder().decode(plain), 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

// ─── Licence string (no encryption needed) ────────────────────────────────────

export function getLicenseString(): string | null {
  try { return localStorage.getItem(LICENSE_LS_KEY); } catch { return null; }
}

export function setLicenseString(str: string): void {
  try { localStorage.setItem(LICENSE_LS_KEY, str); } catch { /* Storage can be disabled or full. */ }
}

export function clearLicense(): void {
  try { localStorage.removeItem(LICENSE_LS_KEY); } catch { /* Storage can be disabled. */ }
}

/** Persist an observed server revocation for subsequent offline launches. */
export function rememberRevokedLicense(licenseId: string): void {
  if (!licenseId) return;
  try { localStorage.setItem(REVOKED_LICENSE_KEY, licenseId); } catch { /* Best-effort offline cache. */ }
}

export function getRememberedRevokedLicense(): string | null {
  try { return localStorage.getItem(REVOKED_LICENSE_KEY); } catch { return null; }
}

// ─── Install date ─────────────────────────────────────────────────────────────

/**
 * Lit l'ancre d'essai du poste, en essayant aussi les cles historiques.
 *
 * Les installations anterieures ont chiffre l'ancre avec une cle derivee du
 * boutiqueId - ou de `'local-boutique'` quand l'authentification n'avait pas
 * encore abouti. Les reessayer evite de perdre l'essai en cours d'un client
 * honnete au moment de la mise a jour.
 */
async function readLocalTrialStart(boutiqueId: string): Promise<number | null> {
  let stored: string | null = null;
  try { stored = localStorage.getItem(INSTALL_DATE_KEY); } catch { return null; }
  if (!stored) return null;

  for (const keyId of [undefined, boutiqueId, 'local-boutique']) {
    const value = await decryptMs(stored, await deriveKey(keyId));
    if (value && value > 0) return value;
  }
  return null;
}

async function writeLocalTrialStart(ms: number): Promise<void> {
  const encrypted = await encryptMs(ms, await deriveKey());
  try { localStorage.setItem(INSTALL_DATE_KEY, encrypted); } catch { /* Continue with the in-memory date. */ }
}

/**
 * Date de debut de l'essai gratuit, en millisecondes.
 *
 * **La regle est : la date la plus ancienne connue gagne, toujours.** Toute
 * incertitude doit raccourcir l'essai, jamais le prolonger - c'est exactement
 * l'inverse que faisait la version precedente, qui accordait 30 jours neufs
 * des qu'elle n'arrivait pas a relire son ancre.
 *
 * Trois sources, reconciliees a chaque lancement :
 *   • le stockage local, qui survit hors ligne mais pas a un effacement ;
 *   • `boutiques/{bid}/_license/trial`, ecrit une seule fois et rendu immuable
 *     par les regles Firestore : c'est lui qui survit a une reinstallation ;
 *   • a defaut, l'horloge deja verifiee par getTrustedNow().
 */
export async function getOrCreateInstallDate(
  boutiqueId: string,
  trustedNow: number = Date.now(),
): Promise<number> {
  const local  = await readLocalTrialStart(boutiqueId);
  const remote = await fsGetTrialStart(boutiqueId);

  const known = [local, remote].filter((v): v is number => !!v && v > 0 && v <= trustedNow);
  const start = known.length > 0 ? Math.min(...known) : trustedNow;

  // Remettre le poste d'aplomb : sa copie peut etre absente, illisible, ou
  // plus recente que celle du serveur.
  if (local !== start) await writeLocalTrialStart(start);

  // Le serveur n'a pas encore d'ancre : on y pose celle-ci. Le document est
  // creable une seule fois, donc ce n'est jamais un moyen de la repousser.
  if (remote === null) void fsCreateTrialStart(boutiqueId);

  return start;
}

// ─── Last-seen trusted time ───────────────────────────────────────────────────

/**
 * Dernier horodatage verifie, ou null.
 *
 * Meme precaution que pour l'ancre d'essai : les cles historiques sont
 * reessayees, sinon la garde anti-recul d'horloge repartirait de zero a chaque
 * changement de boutiqueId - et un poste dont la pile CMOS lache y perdrait sa
 * seule protection.
 */
export async function getLastSeenTime(boutiqueId: string): Promise<number | null> {
  let stored: string | null = null;
  try { stored = localStorage.getItem(LAST_SEEN_KEY); } catch { /* Storage can be disabled. */ }
  if (!stored) return null;

  for (const keyId of [undefined, boutiqueId, 'local-boutique']) {
    const value = await decryptMs(stored, await deriveKey(keyId));
    if (value && value > 0) return value;
  }
  return null;
}

/** Store the latest known-good timestamp. Called after each successful clock check. */
export async function setLastSeenTime(ms: number, _boutiqueId?: string): Promise<void> {
  const encrypted = await encryptMs(ms, await deriveKey());
  try { localStorage.setItem(LAST_SEEN_KEY, encrypted); } catch { /* A failed cache write must not block startup. */ }
}

// ─── Firestore persistence ────────────────────────────────────────────────────

const licPath   = (bid: string) => `boutiques/${bid}/_license/current`;
const trialPath = (bid: string) => `boutiques/${bid}/_license/trial`;

/**
 * Pose la date de debut d'essai sur la boutique, une seule fois.
 *
 * `serverTimestamp()` et non l'horloge du poste : les regles exigent
 * `startedAt == request.time`, donc un poste ne peut pas antidater son essai,
 * et le document est creable une seule fois - ni modifiable, ni supprimable.
 * C'est ce qui le fait survivre a une reinstallation.
 *
 * L'ecriture n'est deliberement pas attendue : hors ligne, une promesse
 * d'ecriture Firestore reste pendante indefiniment, ce qui bloquerait le
 * demarrage de l'application derriere le controle de licence.
 */
export async function fsCreateTrialStart(bid: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  void setDoc(doc(db, trialPath(bid)), { startedAt: serverTimestamp() })
    .catch(() => { /* hors ligne, ou l'ancre existe deja : la copie locale suffit */ });
}

/** Lit la date de debut d'essai posee sur la boutique, ou null hors ligne. */
export async function fsGetTrialStart(bid: string): Promise<number | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const snap = await getDoc(doc(db, trialPath(bid)));
    if (!snap.exists()) return null;
    const startedAt = snap.data()?.startedAt as { toMillis?: () => number } | undefined;
    const ms = startedAt?.toMillis?.();
    return typeof ms === 'number' && ms > 0 ? ms : null;
  } catch {
    return null; // hors ligne - l'appelant retombe sur la copie locale
  }
}

export interface LicenseFirestoreDoc {
  licenseStr: string;
  licenseId:  string;
  plan:       string;
  issuedAt:   number;
  expiresAt:  number;
  revoked?:   boolean;
}

/**
 * Mirror the licence into Firestore. Idempotent by licenseId, and best effort.
 *
 * The write is deliberately NOT awaited. Firestore resolves a write promise only
 * once the server acknowledges it; offline, with persistence enabled, the write
 * is queued locally and the promise stays pending indefinitely - it never
 * rejects, so the try/catch that used to wrap it could not help a caller that
 * awaited this function.
 *
 * That is what froze licence activation: useLicenseActivation stored the licence
 * locally, then awaited this call, so setSuccess(true) never ran and a shopkeeper
 * activating without internet sat on "Vérification…" forever - despite having a
 * perfectly valid licence already saved on their machine. Covered by
 * tests/e2e-flows/license-offline.spec.ts.
 *
 * The local copy is the source of truth for the licence gate; this mirror only
 * helps a reinstall recover.
 */
export async function fsSaveLicense(
  bid: string,
  licenseStr: string,
  payload: LicensePayload,
): Promise<void> {
  if (!isFirebaseConfigured) return;
  void setDoc(
    doc(db, licPath(bid)),
    {
      licenseStr,
      licenseId: payload.licenseId,
      plan:      payload.plan,
      issuedAt:  payload.issuedAt,
      expiresAt: payload.expiresAt,
      revoked:   false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  ).catch(() => { /* offline, or rules refused it - the local copy is enough */ });
}

/** Load the licence from Firestore. Returns null if not found or offline. */
export async function fsGetLicense(bid: string): Promise<LicenseFirestoreDoc | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const snap = await getDoc(doc(db, licPath(bid)));
    if (!snap.exists()) return null;
    return snap.data() as LicenseFirestoreDoc;
  } catch {
    return null; // offline - caller falls back to localStorage
  }
}
