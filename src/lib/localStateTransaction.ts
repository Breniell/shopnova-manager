/**
 * Coordinates multi-store mutations with the local snapshot writer.
 *
 * Zustand stores notify synchronously. Without this small transaction guard,
 * changing products, movements and an inventory session would enqueue three
 * different IndexedDB snapshots, two of which describe an impossible partial
 * business state. Critical subscribers defer their write until the outermost
 * mutation completes.
 */
let depth = 0;
let dirty = false;
const commitListeners = new Set<() => void>();

export function runLocalStateTransaction<T>(mutation: () => T): T {
  depth += 1;
  try {
    return mutation();
  } finally {
    depth -= 1;
    if (depth === 0 && dirty) {
      dirty = false;
      commitListeners.forEach(listener => listener());
    }
  }
}

/** Returns true when the caller must defer its snapshot write. */
export function deferCriticalSnapshotIfTransactionActive(): boolean {
  if (depth === 0) return false;
  dirty = true;
  return true;
}

export function onLocalStateTransactionCommit(listener: () => void): () => void {
  commitListeners.add(listener);
  return () => commitListeners.delete(listener);
}
