import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "firebase/app":       path.resolve(__dirname, "./src/test/__mocks__/firebase.ts"),
      "firebase/auth":      path.resolve(__dirname, "./src/test/__mocks__/firebase.ts"),
      "firebase/firestore": path.resolve(__dirname, "./src/test/__mocks__/firebase.ts"),
    },
  },
});
