#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== DIAGNOSTIC ET RÉPARATION VITE APP ===\n');

const PROJECT_ROOT = process.cwd();

// 1. Vérifier index.html
const indexPath = path.join(PROJECT_ROOT, 'index.html');
console.log('[1/5] Vérification index.html...');

if (!fs.existsSync(indexPath)) {
  console.log('  ❌ index.html manquant - CRÉATION...');
  
  const indexHtml = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ShopNova Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
  
  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('  ✓ index.html créé');
} else {
  const content = fs.readFileSync(indexPath, 'utf8');
  if (!content.includes('src/main.tsx') && !content.includes('src/main.ts')) {
    console.log('  ⚠️  Script manquant dans index.html - CORRECTION...');
    const fixed = content.replace(
      '</body>',
      '  <script type="module" src="/src/main.tsx"></script>\n  </body>'
    );
    fs.writeFileSync(indexPath, fixed, 'utf8');
    console.log('  ✓ index.html corrigé');
  } else {
    console.log('  ✓ index.html OK');
  }
}

// 2. Vérifier src/main.tsx
console.log('\n[2/5] Vérification src/main.tsx...');
const mainPath = path.join(PROJECT_ROOT, 'src', 'main.tsx');

if (!fs.existsSync(mainPath)) {
  console.log('  ❌ src/main.tsx manquant - CRÉATION...');
  
  const mainTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`;
  
  fs.writeFileSync(mainPath, mainTsx, 'utf8');
  console.log('  ✓ src/main.tsx créé');
} else {
  console.log('  ✓ src/main.tsx existe');
}

// 3. Vérifier src/App.tsx
console.log('\n[3/5] Vérification src/App.tsx...');
const appPath = path.join(PROJECT_ROOT, 'src', 'App.tsx');

if (!fs.existsSync(appPath)) {
  console.log('  ⚠️  src/App.tsx manquant - Recherche du Router...');
  
  // Chercher le fichier router
  const routerPath = path.join(PROJECT_ROOT, 'src', 'router.tsx');
  if (fs.existsSync(routerPath)) {
    console.log('  ✓ router.tsx trouvé - Création App.tsx wrapper...');
    
    const appTsx = `import { RouterProvider } from 'react-router-dom';
import { router } from './router';

function App() {
  return <RouterProvider router={router} />;
}

export default App;`;
    
    fs.writeFileSync(appPath, appTsx, 'utf8');
    console.log('  ✓ src/App.tsx créé avec RouterProvider');
  } else {
    console.log('  ❌ Ni App.tsx ni router.tsx trouvé - création App basique');
    const basicApp = `function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">ShopNova Manager</h1>
        <p className="text-gray-600">Application démarrée avec succès</p>
      </div>
    </div>
  );
}

export default App;`;
    fs.writeFileSync(appPath, basicApp, 'utf8');
    console.log('  ✓ src/App.tsx basique créé');
  }
} else {
  console.log('  ✓ src/App.tsx existe');
}

// 4. Vérifier vite.config.ts
console.log('\n[4/5] Vérification vite.config.ts...');
const viteConfigPath = path.join(PROJECT_ROOT, 'vite.config.ts');

if (fs.existsSync(viteConfigPath)) {
  let config = fs.readFileSync(viteConfigPath, 'utf8');
  
  if (!config.includes('server:')) {
    console.log('  ⚠️  Configuration serveur manquante - AJOUT...');
    
    config = config.replace(
      'export default defineConfig({',
      `export default defineConfig({
  server: {
    port: 8080,
    strictPort: false,
    open: true,
  },`
    );
    
    fs.writeFileSync(viteConfigPath, config, 'utf8');
    console.log('  ✓ Configuration serveur ajoutée');
  } else {
    console.log('  ✓ vite.config.ts OK');
  }
} else {
  console.log('  ⚠️  vite.config.ts manquant - CRÉATION...');
  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    strictPort: false,
    open: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});`;
  
  fs.writeFileSync(viteConfigPath, viteConfig, 'utf8');
  console.log('  ✓ vite.config.ts créé');
}

// 5. Vérifier package.json
console.log('\n[5/5] Vérification package.json...');
const packagePath = path.join(PROJECT_ROOT, 'package.json');

if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  if (!pkg.scripts || !pkg.scripts.dev) {
    console.log('  ⚠️  Script dev manquant - AJOUT...');
    if (!pkg.scripts) pkg.scripts = {};
    pkg.scripts.dev = 'vite';
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2), 'utf8');
    console.log('  ✓ Script dev ajouté');
  } else {
    console.log('  ✓ package.json OK');
  }
} else {
  console.log('  ❌ package.json introuvable');
}

console.log('\n=== DIAGNOSTIC TERMINÉ ===\n');
console.log('Prochaines étapes:');
console.log('  1. Arrêter le serveur (Ctrl+C dans le terminal npm run dev)');
console.log('  2. Relancer: npm run dev');
console.log('  3. Ouvrir http://localhost:8080\n');
