import { describe, expect, it } from 'vitest';
import { runBoundedStartup, shouldUseOfflineFallback, withStartupTimeout } from '@/lib/offlineStartup';

describe('offline startup fallback', () => {
  it('opens from local caches whenever the operating system reports offline', () => {
    expect(shouldUseOfflineFallback(new Error('any bootstrap failure'), false)).toBe(true);
  });

  it.each([
    'auth/local-session-missing',
    'auth/network-request-failed',
    'unavailable',
    'firestore/unavailable',
  ])('recognises Firebase network error %s even when navigator is stale', (code) => {
    expect(shouldUseOfflineFallback({ code }, true)).toBe(true);
  });

  it('keeps configuration and permission errors visible while online', () => {
    expect(shouldUseOfflineFallback({ code: 'permission-denied' }, true)).toBe(false);
  });

  it('bounds startup when connectivity detection is a false positive', async () => {
    await expect(withStartupTimeout(new Promise(() => {}), 5))
      .rejects.toMatchObject({ code: 'firestore/unavailable' });
  });

  it('applies a cloud bootstrap result that arrives after the splash timeout', async () => {
    let resolveCloud!: (value: string) => void;
    const cloud = new Promise<string>(resolve => { resolveCloud = resolve; });
    const late: string[] = [];
    await expect(runBoundedStartup(cloud, value => late.push(value), 5)).rejects.toBeTruthy();

    resolveCloud('ready');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(late).toEqual(['ready']);
  });
});
