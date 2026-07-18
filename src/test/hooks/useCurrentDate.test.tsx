import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNextLocalDayDelay, useCurrentDate } from '@/hooks/useCurrentDate';

describe('useCurrentDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes the delay to the next local day', () => {
    const now = new Date(2026, 6, 13, 23, 59, 59, 900);
    expect(getNextLocalDayDelay(now)).toBe(125);
  });

  it('refreshes after local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 13, 23, 59, 59, 900));

    const { result } = renderHook(() => useCurrentDate());
    expect(result.current.getDate()).toBe(13);

    act(() => {
      vi.advanceTimersByTime(125);
    });

    expect(result.current.getDate()).toBe(14);
  });

  it('refreshes on focus after a computer wakes on a later day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 13, 10, 0, 0));

    const { result } = renderHook(() => useCurrentDate());
    vi.setSystemTime(new Date(2026, 6, 14, 10, 0, 0));

    act(() => window.dispatchEvent(new Event('focus')));

    expect(result.current.getDate()).toBe(14);
  });
});
