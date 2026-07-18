import { afterEach, describe, expect, it } from 'vitest';
import { useAuthStore, type User } from '@/stores/useAuthStore';

describe('staff authentication cache', () => {
  afterEach(() => {
    useAuthStore.setState({ users: [], currentUser: null, isAuthenticated: false, loginAttempts: {} });
    localStorage.removeItem('legwan-auth');
    localStorage.removeItem('legwan-boutique-id');
  });

  it('persists hashes but never persists an authenticated session', () => {
    const user: User = {
      id: 'manager-1',
      prenom: 'Ada',
      nom: 'Manager',
      role: 'gérant',
      pin: 'a'.repeat(64),
      salt: 'b'.repeat(32),
      hashAlgo: 'pbkdf2',
      color: '#A93200',
    };

    useAuthStore.getState()._setUsers([user]);
    useAuthStore.setState({ currentUser: user, isAuthenticated: true });

    const persisted = JSON.parse(localStorage.getItem('legwan-auth') ?? '{}');
    expect(persisted.state.users).toEqual([user]);
    expect(persisted.state.users[0].pin).not.toBe('1234');
    expect(persisted.state.currentUser).toBeUndefined();
    expect(persisted.state.isAuthenticated).toBeUndefined();
    expect(persisted.state.tenantId).toBe('unregistered');
  });

  it('neutralizes authenticated sessions written by older versions', async () => {
    localStorage.setItem('legwan-auth', JSON.stringify({
      state: { currentUser: { id: 'old-manager', role: 'gérant' }, isAuthenticated: true, users: [] },
      version: 0,
    }));

    await useAuthStore.persist.rehydrate();

    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('does not hydrate staff hashes belonging to another tenant', async () => {
    localStorage.setItem('legwan-boutique-id', 'tenant-b');
    localStorage.setItem('legwan-auth', JSON.stringify({
      state: { tenantId: 'tenant-a', users: [{ id: 'foreign-manager', role: 'gérant' }] },
      version: 0,
    }));

    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().users).toEqual([]);
  });
});
