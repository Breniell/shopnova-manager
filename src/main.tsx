import ErrorBoundary from './components/ErrorBoundary';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: never register SW in iframe
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

if (isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((r) => r.forEach((sw) => sw.unregister()));
}

// Migrate: clear old plaintext PIN auth data
const authData = localStorage.getItem('legwan-auth');
if (authData) {
  try {
    const parsed = JSON.parse(authData);
    const users = parsed?.state?.users;
    if (users?.[0]?.pin && users[0].pin.length <= 8) {
      localStorage.removeItem('legwan-auth');
    }
  } catch { /* ignore */ }
}

createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);

// Screenshot mode — expose stores for Playwright seeding (dev only, never bundled in prod)
if (import.meta.env.DEV) {
  import('./stores/useAuthStore').then(({ useAuthStore }) =>
  import('./stores/useProductStore').then(({ useProductStore }) =>
  import('./stores/useSaleStore').then(({ useSaleStore }) =>
  import('./stores/useStockStore').then(({ useStockStore }) =>
  import('./stores/useSettingsStore').then(({ useSettingsStore }) => {
    (window as unknown as Record<string, unknown>).__legwan__ = {
      auth: useAuthStore, products: useProductStore,
      sales: useSaleStore, stock: useStockStore, settings: useSettingsStore,
    };
  })))));
}
