import "@testing-library/jest-dom";

// ─── matchMedia (jsdom doesn't implement it) ──────────────────────────────────
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
// ─── Firebase ─────────────────────────────────────────────────────────────────
// VITE_FIREBASE_PROJECT_ID is not set in test env → isFirebaseConfigured = false
// → all Firestore service functions are immediate no-ops → no mocks needed.
// boutiqueService.getBoutiqueId() returns 'local-boutique' when not configured.
