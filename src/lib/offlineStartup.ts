/**
 * Returns true when a cloud bootstrap failure is safe to treat as an offline
 * startup. `navigator.onLine` is only a hint, so Firebase's explicit network
 * error codes are accepted too.
 */
export function shouldUseOfflineFallback(error: unknown, online = navigator.onLine): boolean {
  if (!online) return true;
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  return code === 'auth/local-session-missing'
    || code === 'auth/network-request-failed'
    || code === 'unavailable'
    || code === 'firestore/unavailable';
}

export async function withStartupTimeout<T>(promise: Promise<T>, timeoutMs = 8_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(
      new Error('Initialisation cloud trop longue.'),
      { code: 'firestore/unavailable' },
    )), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Bounds the splash screen without abandoning a cloud bootstrap already in
 * flight. If it finishes after the timeout, its result is still applied.
 */
export async function runBoundedStartup<T>(
  promise: Promise<T>,
  onLateSuccess: (value: T) => void,
  timeoutMs = 8_000,
): Promise<T> {
  try {
    return await withStartupTimeout(promise, timeoutMs);
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === 'firestore/unavailable') {
      promise.then(onLateSuccess).catch(() => {});
    }
    throw error;
  }
}
