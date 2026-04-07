import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';

export function useSessionTimeout(timeoutMinutes: number = 15) {
  const logout = useAuthStore(s => s.logout);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const resetTimer = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        logout();
      }, timeoutMinutes * 60 * 1000);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [logout, timeoutMinutes]);
}
