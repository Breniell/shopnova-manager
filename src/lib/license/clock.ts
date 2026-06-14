/**
 * Trusted clock — résout le problème de l'horloge dérèglée au Cameroun.
 *
 * Contexte terrain (Cameroun, 2024-2026)
 * ───────────────────────────────────────
 * Les coupures de courant sont quotidiennes dans de nombreuses villes camerounaises
 * (Douala, Yaoundé, Bafoussam, Ngaoundéré…). Quand un PC bureautique perd
 * l'alimentation plusieurs fois par jour, la pile CMOS du BIOS se décharge
 * progressivement. Résultat : au redémarrage, la date peut être réinitialisée
 * en janvier 2000, voire à une date antérieure à 2020.
 *
 * Conséquence sans cette garde : si un client honnête dont l'horloge affiche
 * "2000-01-01" tente d'utiliser l'application, un garde naïf lirait
 * Date.now() → 2000 → "licence expirée depuis 24 ans" → BLOCAGE INJUSTE.
 * Ce fichier existe précisément pour éviter ce scénario.
 *
 * Stratégie
 * ─────────
 * 1. En ligne : récupérer l'heure réseau via Firestore (write serverTimestamp +
 *    read-back). C'est la source de vérité. On la stocke comme "last-seen".
 *    clockWarning = false.
 *
 * 2. Hors ligne :
 *    a. Si Date.now() < 2020-01-01 → horloge BIOS manifestement dérèglée.
 *       → Utiliser last-seen (ou la date d'install si last-seen absent).
 *       → clockWarning = true. NE PAS bloquer l'app.
 *
 *    b. Si Date.now() < last-seen → horloge a RECULÉ (pile CMOS ou ajustement
 *       manuel suspicieux). Prendre last-seen (prudent).
 *       → clockWarning = true.
 *
 *    c. Sinon → max(Date.now(), last-seen). clockWarning = false.
 *
 * Un client HONNÊTE dont le PC a perdu l'heure ne doit JAMAIS être bloqué à
 * tort. Un attaquant qui recule intentionnellement l'horloge se voit retourner
 * last-seen, ce qui ne lui accorde aucun avantage (l'heure reste au niveau de
 * la dernière vérification valide).
 */
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';

/** Unix timestamp before which the system clock is certainly wrong (BIOS reset). */
const EPOCH_FLOOR = new Date('2020-01-01T00:00:00Z').getTime();

export interface TrustedTimeResult {
  now:          number;  // best estimate of the current time (ms)
  clockWarning: boolean; // true = system clock unreliable, UI should show a warning
}

/**
 * Fetch the current time from Firestore server timestamp.
 * Writes a lightweight tick document to get the server's authoritative time.
 * Returns null if offline or Firestore is not configured.
 */
async function defaultFetchNetworkTime(): Promise<number | null> {
  if (!isFirebaseConfigured || !db) return null;
  try {
    // Import getBoutiqueId lazily to avoid a circular import at module level.
    const { getBoutiqueId } = await import('@/services/boutiqueService');
    let bid: string;
    try { bid = getBoutiqueId(); } catch { return null; }

    const clockRef = doc(db, `boutiques/${bid}/_clock/tick`);
    // Write a server timestamp. merge:true is idempotent — no data is lost.
    await setDoc(clockRef, { at: serverTimestamp() }, { merge: true });
    const snap = await getDoc(clockRef);
    const ts   = snap.data()?.at as Timestamp | undefined;
    return ts?.toMillis() ?? null;
  } catch {
    // Any network error → treat as offline
    return null;
  }
}

/**
 * Returns the best estimate of the current time, with a flag indicating
 * whether the system clock is unreliable.
 *
 * @param lastSeenMs   The last confirmed-good timestamp from localStorage.
 *                     Pass null on first launch.
 * @param fetchFn      Injectable network-time function (override in tests).
 * @param _systemNow   Override Date.now() — for deterministic tests only.
 */
export async function getTrustedNow(
  lastSeenMs:  number | null,
  fetchFn:     () => Promise<number | null> = defaultFetchNetworkTime,
  _systemNow?: number,
): Promise<TrustedTimeResult> {

  // ── 1. Try network time ───────────────────────────────────────────────────
  // When online, the server timestamp is the single source of truth.
  // We do NOT update lastSeenMs here — the caller is responsible for that,
  // so it can persist it before the next offline session.
  try {
    const networkTime = await fetchFn();
    if (networkTime !== null && networkTime > EPOCH_FLOOR) {
      // Sanity check: network time should also be post-2020.
      // (Guards against a misconfigured server or a corrupted response.)
      return { now: networkTime, clockWarning: false };
    }
  } catch {
    // fetchFn threw → treat as offline
  }

  // ── 2. Offline fallback ───────────────────────────────────────────────────
  const systemNow = _systemNow ?? Date.now();
  const lastSeen  = lastSeenMs ?? 0;

  // Case 2a: system clock is BEFORE 2020 → almost certainly a BIOS reset
  // (power outage that drained the CMOS battery).
  // We do NOT block the app — it would be an unfair penalty on an honest user.
  if (systemNow < EPOCH_FLOOR) {
    return {
      now:          lastSeen > EPOCH_FLOOR ? lastSeen : EPOCH_FLOOR,
      clockWarning: true,
    };
  }

  // Case 2b: system clock WENT BACKWARD relative to the last known-good time.
  // This indicates a clock adjustment (manual or BIOS-induced).
  // Use last-seen as the lower bound to prevent rolling back the effective time.
  if (lastSeen > 0 && systemNow < lastSeen) {
    return { now: lastSeen, clockWarning: true };
  }

  // Case 2c: system clock is reasonable — use it (or last-seen if somehow higher).
  return {
    now:          lastSeen > 0 ? Math.max(systemNow, lastSeen) : systemNow,
    clockWarning: false,
  };
}
