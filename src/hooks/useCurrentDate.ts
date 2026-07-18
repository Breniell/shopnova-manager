import { useCallback, useEffect, useState } from 'react';

const MIDNIGHT_SAFETY_DELAY_MS = 25;

/** Milliseconds until the next local day, with a small timer-jitter margin. */
export function getNextLocalDayDelay(now: Date): number {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(1, nextDay.getTime() - now.getTime() + MIDNIGHT_SAFETY_DELAY_MS);
}

/**
 * A stable current date that refreshes when the local day changes.
 * Focus/visibility refreshes cover computers that slept through midnight.
 */
export function useCurrentDate(): Date {
  const [now, setNow] = useState(() => new Date());
  const refresh = useCallback(() => setNow(new Date()), []);

  useEffect(() => {
    const timer = window.setTimeout(refresh, getNextLocalDayDelay(now));
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [now, refresh]);

  return now;
}
