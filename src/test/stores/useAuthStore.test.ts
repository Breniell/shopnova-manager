import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/useAuthStore';

const INITIAL_STATE = useAuthStore.getState();

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    ...INITIAL_STATE,
    currentUser: null,
    isAuthenticated: false,
    loginAttempts: {},
  });
});

// ─── Initial state ────────────────────────────────────────────────────────────
describe('useAuthStore — initial state', () => {
  it('loads 3 default users', () => {
    expect(useAuthStore.getState().users).toHaveLength(3);
  });

  it('starts unauthenticated', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('default users have correct roles', () => {
    const { users } = useAuthStore.getState();
    const manager = users.find(u => u.role === 'gérant');
    expect(manager).toBeDefined();
    const cashiers = users.filter(u => u.role === 'caissier');
    expect(cashiers).toHaveLength(2);
  });
});

// ─── login ────────────────────────────────────────────────────────────────────
describe('useAuthStore — login', () => {
  // Use updateUserPin to set known PINs before testing login,
  // since the default user hashes are generated with unknown source values.
  beforeEach(async () => {
    await useAuthStore.getState().updateUserPin('1', '1234');
    await useAuthStore.getState().updateUserPin('2', '5678');
  });

  it('authenticates with correct PIN (Marie Nguema / 1234)', async () => {
    const result = await useAuthStore.getState().login('1', '1234');
    expect(result.success).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().currentUser?.id).toBe('1');
  });

  it('authenticates Paul Mbarga with PIN 5678', async () => {
    const result = await useAuthStore.getState().login('2', '5678');
    expect(result.success).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const result = await useAuthStore.getState().login('1', '9999');
    expect(result.success).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('rejects login for an unknown user id', async () => {
    const result = await useAuthStore.getState().login('999', '1234');
    expect(result.success).toBe(false);
  });

  it('increments login attempts on failure', async () => {
    await useAuthStore.getState().login('1', 'wrong');
    const attempts = useAuthStore.getState().loginAttempts['1'];
    expect(attempts.count).toBe(1);
  });

  it('resets attempt count on success', async () => {
    await useAuthStore.getState().login('1', 'wrong');
    await useAuthStore.getState().login('1', '1234');
    const attempts = useAuthStore.getState().loginAttempts['1'];
    expect(attempts.count).toBe(0);
  });

  it('locks account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await useAuthStore.getState().login('1', 'wrong');
    }
    const result = await useAuthStore.getState().login('1', 'wrong');
    expect(result.locked).toBe(true);
    expect(result.remainingSeconds).toBeGreaterThan(0);
  });

  it('returns remainingSeconds when account is locked', async () => {
    for (let i = 0; i < 5; i++) {
      await useAuthStore.getState().login('1', 'wrong');
    }
    const result = await useAuthStore.getState().login('1', '1234'); // correct PIN but locked
    expect(result.locked).toBe(true);
    expect(result.remainingSeconds).toBeGreaterThan(200); // ~300 seconds
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────
describe('useAuthStore — logout', () => {
  it('clears current user and authentication state', async () => {
    await useAuthStore.getState().updateUserPin('1', '1234');
    await useAuthStore.getState().login('1', '1234');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });
});

// ─── addUser ──────────────────────────────────────────────────────────────────
describe('useAuthStore — addUser', () => {
  it('adds a new user to the list', async () => {
    const before = useAuthStore.getState().users.length;
    await useAuthStore.getState().addUser({
      prenom: 'Nouveau',
      nom: 'Caissier',
      role: 'caissier',
      pin: '9876',
      color: '#FF0000',
    });
    expect(useAuthStore.getState().users).toHaveLength(before + 1);
  });

  it('hashes the PIN (stored value != raw PIN)', async () => {
    await useAuthStore.getState().addUser({
      prenom: 'Test',
      nom: 'User',
      role: 'caissier',
      pin: '0000',
      color: '#000000',
    });
    const users = useAuthStore.getState().users;
    const newUser = users[users.length - 1];
    expect(newUser.pin).not.toBe('0000');
    expect(newUser.pin).toHaveLength(64); // SHA-256 hex
  });

  it('new user can log in with their PIN', async () => {
    await useAuthStore.getState().addUser({
      prenom: 'Test',
      nom: 'Login',
      role: 'caissier',
      pin: '7777',
      color: '#AAAAAA',
    });
    const newUser = useAuthStore.getState().users.find(u => u.prenom === 'Test')!;
    const result = await useAuthStore.getState().login(newUser.id, '7777');
    expect(result.success).toBe(true);
  });
});

// ─── updateUserPin ────────────────────────────────────────────────────────────
describe('useAuthStore — updateUserPin', () => {
  it('changes the PIN hash for the user', async () => {
    const user = useAuthStore.getState().users[0];
    const oldHash = user.pin;
    await useAuthStore.getState().updateUserPin(user.id, '4321');
    const updated = useAuthStore.getState().users.find(u => u.id === user.id)!;
    expect(updated.pin).not.toBe(oldHash);
  });

  it('allows login with the new PIN after update', async () => {
    const user = useAuthStore.getState().users[0];
    await useAuthStore.getState().updateUserPin(user.id, '9999');
    const result = await useAuthStore.getState().login(user.id, '9999');
    expect(result.success).toBe(true);
  });

  it('rejects the old PIN after update', async () => {
    // First set a known PIN, then change it, then verify the old one is rejected
    await useAuthStore.getState().updateUserPin('1', '1234');
    await useAuthStore.getState().updateUserPin('1', '9999');
    const result = await useAuthStore.getState().login('1', '1234'); // old PIN
    expect(result.success).toBe(false);
  });
});

// ─── deleteUser ───────────────────────────────────────────────────────────────
describe('useAuthStore — deleteUser', () => {
  it('removes the user from the list', () => {
    const before = useAuthStore.getState().users.length;
    useAuthStore.getState().deleteUser('2');
    expect(useAuthStore.getState().users).toHaveLength(before - 1);
    expect(useAuthStore.getState().users.find(u => u.id === '2')).toBeUndefined();
  });

  it('does nothing for an unknown id', () => {
    const before = useAuthStore.getState().users.length;
    useAuthStore.getState().deleteUser('nonexistent');
    expect(useAuthStore.getState().users).toHaveLength(before);
  });
});
