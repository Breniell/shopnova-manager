import ErrorBoundary from './components/ErrorBoundary';
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: never register SW in iframe / preview
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((r) => r.forEach((sw) => sw.unregister()));
}

// Migrate: clear old plaintext PIN auth data
const authData = localStorage.getItem('shopnova-auth');
if (authData) {
  try {
    const parsed = JSON.parse(authData);
    const users = parsed?.state?.users;
    if (users?.[0]?.pin && users[0].pin.length <= 8) {
      localStorage.removeItem('shopnova-auth');
    }
  } catch { /* ignore */ }
}

createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);
