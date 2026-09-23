/**
 * L'ancre de l'essai gratuit.
 *
 * Cette fonction n'avait aucun test, et c'est precisement par la que la faille
 * est passee : toute lecture qui echouait etait traitee comme une premiere
 * installation, donc accordait 30 jours de plus - en silence. Le systeme pur
 * (signature, expiration, grace, horloge) etait couvert par une cinquantaine de
 * tests ; la persistance, par aucun.
 *
 * La regle que ces tests defendent tient en une phrase : **en cas de doute, la
 * date la plus ancienne connue gagne.** Une incertitude doit raccourcir
 * l'essai, jamais le prolonger.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Firebase declare non configure : fsGetTrialStart renvoie alors null et
// fsCreateTrialStart ne fait rien. Ces tests portent donc sur le poste hors
// ligne - le cas le plus defavorable, ou seule la copie locale existe. C'est
// exactement la situation dans laquelle l'essai repartait a zero.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), setDoc: vi.fn(), getDoc: vi.fn(), serverTimestamp: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, isFirebaseConfigured: false }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-23T10:00:00Z').getTime();

async function loadStore() {
  vi.resetModules();
  return vi.importActual<typeof import('@/lib/license/store')>('@/lib/license/store');
}

/**
 * Reproduit le chiffrement des versions <= 1.11.0, dont la cle derivait du
 * boutiqueId.
 *
 * Ces constantes doublent celles de `store.ts` a dessein : c'est le seul moyen
 * de fabriquer une ancre telle qu'une installation existante l'a sur le disque,
 * et donc de verifier qu'une mise a jour ne fait pas perdre l'essai en cours
 * d'un client honnete. Si quelqu'un change les constantes livrees, ce test
 * tombe - ce qui est le comportement voulu.
 */
async function encryptLegacy(ms: number, boutiqueId: string): Promise<string> {
  const raw = new TextEncoder().encode('legwan-ts-guard-v1' + boutiqueId);
  const km  = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('lgw-ts-v1'), hash: 'SHA-256', iterations: 10_000 },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(ms)));
  const packed = new Uint8Array(12 + cipher.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(cipher), 12);
  return btoa(String.fromCharCode(...packed));
}

/** Ecrit une ancre dans le stockage local, a l'ancienne facon. */
async function seedLocalAnchor(_store: unknown, ms: number, boutiqueId: string) {
  localStorage.setItem('legwan-install-date', await encryptLegacy(ms, boutiqueId));
}

describe('ancre d\'essai - la date la plus ancienne gagne', () => {
  let store: typeof import('@/lib/license/store');

  beforeEach(async () => {
    localStorage.clear();
    store = await loadStore();
  });

  it('ancre l\'essai a l\'heure verifiee au tout premier lancement', async () => {
    const start = await store.getOrCreateInstallDate('boutique-a', NOW);
    expect(start).toBe(NOW);
  });

  it('retrouve la meme ancre au lancement suivant', async () => {
    await store.getOrCreateInstallDate('boutique-a', NOW);
    const later = await store.getOrCreateInstallDate('boutique-a', NOW + 5 * DAY);
    expect(later, 'l\'essai est reparti a zero au deuxieme lancement').toBe(NOW);
  });

  it('NE REPART PAS a zero quand le boutiqueId a change', async () => {
    // Le defaut rapporte : LicenseGate demarre avant l'authentification et
    // retombe sur 'local-boutique', puis retrouve le vrai identifiant au
    // lancement suivant. L'ancre etait alors illisible, donc reinitialisee.
    await seedLocalAnchor(store, NOW, 'local-boutique');

    const later = await store.getOrCreateInstallDate('vrai-identifiant-boutique', NOW + 20 * DAY);
    expect(later, 'un changement de boutiqueId relance 30 jours d\'essai').toBe(NOW);
  });

  it('ignore une ancre locale posee dans le futur', async () => {
    await seedLocalAnchor(store, NOW + 90 * DAY, 'boutique-a');
    const start = await store.getOrCreateInstallDate('boutique-a', NOW);
    expect(start, 'une ancre future a prolonge l\'essai').toBe(NOW);
  });

  it('ne tient pas compte d\'un stockage local illisible', async () => {
    localStorage.setItem('legwan-install-date', 'ceci-n-est-pas-du-chiffre');
    const start = await store.getOrCreateInstallDate('boutique-a', NOW);
    expect(start).toBe(NOW);
  });
});

describe('ancre d\'essai - lecture des cles historiques', () => {
  let store: typeof import('@/lib/license/store');

  beforeEach(async () => {
    localStorage.clear();
    store = await loadStore();
  });

  it('relit une ancre ecrite par une version anterieure', async () => {
    // Un client en cours d'essai qui installe la mise a jour ne doit ni perdre
    // son essai, ni s'en voir offrir un neuf.
    await seedLocalAnchor(store, NOW, 'boutique-a');
    const start = await store.getOrCreateInstallDate('boutique-a', NOW + 10 * DAY);
    expect(start, 'la mise a jour a perdu l\'essai en cours').toBe(NOW);
  });

  it('conserve l\'horodatage de derniere vue malgre un changement d\'identifiant', async () => {
    // Meme piege que l'ancre : sans cela, la garde anti-recul d'horloge
    // repartirait de zero et un poste a la pile CMOS morte perdrait sa seule
    // protection.
    await store.setLastSeenTime(NOW, 'local-boutique');
    const seen = await store.getLastSeenTime('vrai-identifiant-boutique');
    expect(seen, 'le dernier horodatage verifie est perdu').toBe(NOW);
  });

  it('rend null quand rien n\'a jamais ete enregistre', async () => {
    expect(await store.getLastSeenTime('boutique-a')).toBeNull();
  });
});
