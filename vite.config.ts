import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

const productionCsp = [
  "default-src 'self' file:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://ipwho.is https://ipapi.co https://geolocation-db.com https://nominatim.openstreetmap.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function contentSecurityPolicyPlugin(isDevelopmentServer: boolean) {
  const content = isDevelopmentServer
    ? productionCsp
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws: wss: http: https:")
    : productionCsp;

  return {
    name: 'legwan-content-security-policy',
    transformIndexHtml: {
      order: 'pre' as const,
      handler: () => [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content },
        injectTo: 'head-prepend' as const,
      }],
    },
  };
}

export default defineConfig(({ mode, command }) => ({
  // electron build requires relative paths (file:// protocol)
  base: mode === 'electron' ? './' : '/',
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    contentSecurityPolicyPlugin(command === 'serve'),
    react(),
    // PWA is not compatible with Electron (no service workers in file:// context)
    mode !== 'electron' && VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,svg,woff,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "product-images", expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 } },
          },
        ],
      },
      manifest: false,
    }),
  ].filter(Boolean) as import('vite').PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Rollup 5 (used by Vite 8) requires the function form.
        manualChunks(id: string) {
          const moduleId = id.replace(/\\/g, '/');
          if (!moduleId.includes('/node_modules/')) return undefined;
          if (moduleId.includes('/firebase/') || moduleId.includes('/@firebase/')) {
            return 'vendor-firebase';
          }
          if (moduleId.includes('/recharts/')) return 'vendor-charts';
          if (moduleId.includes('/leaflet/') || moduleId.includes('/react-leaflet')) {
            return 'vendor-maps';
          }
          if (moduleId.includes('/react/') || moduleId.includes('/react-dom/') ||
              moduleId.includes('/react-router')) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
}));
