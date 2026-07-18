import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    authStateReady: vi.fn(async () => {}),
    currentUser: null as { uid: string } | null,
  },
  signInAnonymously: vi.fn(async () => ({ user: { uid: 'online-uid' } })),
  getIdTokenResult: vi.fn(async () => ({ claims: {} as Record<string, unknown> })),
  disableFirebaseForLocalMode: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  auth: mocks.auth,
  isFirebaseConfigured: true,
  disableFirebaseForLocalMode: mocks.disableFirebaseForLocalMode,
  enableFirebaseAfterLocalMigration: vi.fn(),
  getFirebaseRuntimeConfig: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: vi.fn() },
  linkWithCredential: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInAnonymously: mocks.signInAnonymously,
  signInWithEmailAndPassword: vi.fn(),
  getIdTokenResult: mocks.getIdTokenResult,
}));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
}

describe('initBoutique — offline identity restoration', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    mocks.auth.currentUser = null;
    mocks.auth.authStateReady.mockClear();
    mocks.signInAnonymously.mockClear();
    mocks.getIdTokenResult.mockClear();
    mocks.getIdTokenResult.mockResolvedValue({ claims: {} });
    mocks.disableFirebaseForLocalMode.mockClear();
  });

  it('never treats a cached UID as an authentication credential', async () => {
    setOnline(false);
    localStorage.setItem('legwan-boutique-id', 'cached-uid');
    const { initBoutique } = await import('@/services/boutiqueService');

    await expect(initBoutique()).rejects.toMatchObject({ code: 'auth/local-session-missing' });
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it('does not silently create a different tenant when connectivity returns', async () => {
    setOnline(true);
    localStorage.setItem('legwan-boutique-id', 'cached-uid');
    const { initBoutique } = await import('@/services/boutiqueService');

    await expect(initBoutique()).rejects.toMatchObject({ code: 'auth/local-session-missing' });
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it('fails fast offline when this PC has never established an identity', async () => {
    setOnline(false);
    const { initBoutique } = await import('@/services/boutiqueService');

    await expect(initBoutique()).rejects.toMatchObject({ code: 'auth/network-request-failed' });
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it('stores a Firebase identity after a connected first launch', async () => {
    setOnline(true);
    const { initBoutique } = await import('@/services/boutiqueService');

    await expect(initBoutique()).resolves.toBe('online-uid');
    expect(localStorage.getItem('legwan-boutique-id')).toBe('online-uid');
  });

  it('uses a validated boutique claim for an employee Firebase identity', async () => {
    setOnline(true);
    mocks.auth.currentUser = { uid: 'employee-auth-uid' };
    mocks.getIdTokenResult.mockResolvedValue({ claims: { boutiqueId: 'cloud-boutique-uid' } });
    const { initBoutique } = await import('@/services/boutiqueService');

    await expect(initBoutique()).resolves.toBe('cloud-boutique-uid');
    expect(localStorage.getItem('legwan-boutique-id')).toBe('cloud-boutique-uid');
  });

  it('keeps Firebase enabled for a remembered cloud tenant during fallback', async () => {
    localStorage.setItem('legwan-boutique-id', 'cached-cloud-uid');
    const { activateLocalOfflineBoutique } = await import('@/services/boutiqueService');

    expect(activateLocalOfflineBoutique()).toBe('cached-cloud-uid');
    expect(mocks.disableFirebaseForLocalMode).not.toHaveBeenCalled();
  });

  it('disables Firebase only for a genuinely new autonomous installation', async () => {
    const { activateLocalOfflineBoutique } = await import('@/services/boutiqueService');

    expect(activateLocalOfflineBoutique()).toMatch(/^local-/);
    expect(mocks.disableFirebaseForLocalMode).toHaveBeenCalledTimes(1);
  });
});
