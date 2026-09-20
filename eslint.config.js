import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "build/**",
      "release/**",
      "demo-report/**",
      "demo-results/**",
      "screenshots/**",
      "tools/**",
      "__bb_backup__/**",
      "node_modules/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // prompt() n'est pas implémenté dans Electron : Chromium y renvoie null
      // sans rien afficher. Un window.prompt() a ainsi rendu l'ajout de
      // catégorie inopérant dans l'application installée, alors qu'il
      // fonctionnait en navigateur - donc invisible en développement comme
      // dans les tests Playwright, qui s'exécutent eux aussi en navigateur.
      // Passer par un champ de saisie dans l'interface.
      //
      // La règle vise prompt() seul, sous ses deux écritures. alert() et
      // confirm(), eux, fonctionnent bien dans Electron.
      "no-restricted-globals": ["error", {
        name: "prompt",
        message: "prompt() ne fonctionne pas dans Electron (renvoie null). Utilisez un champ de saisie dans l'interface.",
      }],
      "no-restricted-properties": ["error", {
        object: "window",
        property: "prompt",
        message: "window.prompt() ne fonctionne pas dans Electron (renvoie null). Utilisez un champ de saisie dans l'interface.",
      }],
    },
  },
);
