/**
 * Tests for src/lib/license/clock.ts
 *
 * All network calls are injected via the fetchFn parameter so the tests
 * run 100% offline and deterministically.
 * Date.now() is overridden via the _systemNow parameter (no vi.spyOn needed).
 */
import { describe, it, expect } from 'vitest';
import { getTrustedNow } from '@/lib/license/clock';

// 2025-06-14 as a reference "reasonable" timestamp
const REASONABLE_DATE = new Date('2025-06-14T12:00:00Z').getTime();

// Simulated "last known-good time" stored by the app
const LAST_SEEN = new Date('2025-06-10T08:00:00Z').getTime();

// Network stub helpers
const online  = (t: number) => () => Promise.resolve(t);
const offline = ()          => Promise.resolve<number | null>(null);

describe('getTrustedNow — online mode', () => {
  it('returns network time and clockWarning=false when online', async () => {
    const netTime = new Date('2025-06-14T10:00:00Z').getTime();
    const result  = await getTrustedNow(null, online(netTime), REASONABLE_DATE);
    expect(result.now).toBe(netTime);
    expect(result.clockWarning).toBe(false);
  });

  it('ignores system clock entirely when network time is available', async () => {
    const netTime = new Date('2026-01-01T00:00:00Z').getTime();
    // System clock is far in the past — should not matter
    const result  = await getTrustedNow(null, online(netTime), 0);
    expect(result.now).toBe(netTime);
    expect(result.clockWarning).toBe(false);
  });

  it('ignores last-seen when network time is available', async () => {
    const netTime = new Date('2025-06-14T10:00:00Z').getTime();
    const result  = await getTrustedNow(LAST_SEEN, online(netTime), REASONABLE_DATE);
    expect(result.now).toBe(netTime);
    expect(result.clockWarning).toBe(false);
  });
});

describe('getTrustedNow — offline, BIOS reset (clock before 2020)', () => {
  // This is the Cameroon power-outage scenario: the system clock resets to
  // a date in the past (often 2000-01-01) because the CMOS battery is drained.

  it('returns last-seen and clockWarning=true when system clock is pre-2020', async () => {
    const absurdDate = new Date('2000-01-01T00:00:00Z').getTime();
    const result     = await getTrustedNow(LAST_SEEN, offline, absurdDate);
    expect(result.now).toBe(LAST_SEEN);
    expect(result.clockWarning).toBe(true);
  });

  it('returns EPOCH_FLOOR (2020-01-01) when system is pre-2020 and no last-seen', async () => {
    const absurdDate = new Date('1999-12-31T23:59:59Z').getTime();
    const result     = await getTrustedNow(null, offline, absurdDate);
    const EPOCH_FLOOR = new Date('2020-01-01T00:00:00Z').getTime();
    expect(result.now).toBeGreaterThanOrEqual(EPOCH_FLOOR);
    expect(result.clockWarning).toBe(true);
  });

  it('does NOT block the app when clock is absurd (clockWarning, not error)', async () => {
    const absurdDate = new Date('2001-09-11T00:00:00Z').getTime();
    const result     = await getTrustedNow(LAST_SEEN, offline, absurdDate);
    // Should return a usable timestamp, not throw
    expect(result.now).toBeGreaterThan(0);
    expect(result.clockWarning).toBe(true);
  });
});

describe('getTrustedNow — offline, clock went backward', () => {
  it('returns last-seen and clockWarning=true when system clock < last-seen', async () => {
    // System clock is 6 months BEHIND what we last recorded — suspicious.
    const backwardNow = new Date('2024-12-01T00:00:00Z').getTime(); // < LAST_SEEN
    const result      = await getTrustedNow(LAST_SEEN, offline, backwardNow);
    expect(result.now).toBe(LAST_SEEN);
    expect(result.clockWarning).toBe(true);
  });

  it('slight backward movement also triggers warning', async () => {
    const slightlyBack = LAST_SEEN - 1000; // 1 second behind
    const result       = await getTrustedNow(LAST_SEEN, offline, slightlyBack);
    expect(result.now).toBe(LAST_SEEN);
    expect(result.clockWarning).toBe(true);
  });
});

describe('getTrustedNow — offline, clock is reasonable', () => {
  it('returns system time with no warning when clock is after last-seen', async () => {
    const laterNow = LAST_SEEN + 4 * 24 * 3600_000; // 4 days later
    const result   = await getTrustedNow(LAST_SEEN, offline, laterNow);
    expect(result.now).toBe(laterNow);
    expect(result.clockWarning).toBe(false);
  });

  it('returns system time with no warning when no last-seen exists', async () => {
    const result = await getTrustedNow(null, offline, REASONABLE_DATE);
    expect(result.now).toBe(REASONABLE_DATE);
    expect(result.clockWarning).toBe(false);
  });

  it('takes max(systemNow, lastSeen) when systemNow > lastSeen', async () => {
    const futureNow = LAST_SEEN + 10 * 24 * 3600_000;
    const result    = await getTrustedNow(LAST_SEEN, offline, futureNow);
    expect(result.now).toBe(futureNow);
    expect(result.clockWarning).toBe(false);
  });
});

describe('getTrustedNow — network error treated as offline', () => {
  it('does not hang when the network probe stays pending offline', async () => {
    const never = () => new Promise<number | null>(() => {});
    const started = Date.now();
    const result = await getTrustedNow(LAST_SEEN, never, REASONABLE_DATE, 5);

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result.now).toBe(REASONABLE_DATE);
    expect(result.clockWarning).toBe(false);
  });

  it('falls back to system clock when fetchFn throws', async () => {
    const throwing = () => Promise.reject(new Error('network error'));
    const result   = await getTrustedNow(null, throwing, REASONABLE_DATE);
    expect(result.now).toBe(REASONABLE_DATE);
    expect(result.clockWarning).toBe(false);
  });

  it('falls back to last-seen when fetchFn throws and clock went backward', async () => {
    const throwing    = () => Promise.reject(new Error('network error'));
    const backwardNow = LAST_SEEN - 86_400_000; // 1 day back
    const result      = await getTrustedNow(LAST_SEEN, throwing, backwardNow);
    expect(result.now).toBe(LAST_SEEN);
    expect(result.clockWarning).toBe(true);
  });
});
