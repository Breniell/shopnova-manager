const fs = require('fs');
const path = require('path');

console.log('=== VÉRIFICATION COMPOSANTS CRITIQUES ===\n');

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

let issues = [];
let fixes = 0;

// 1. Vérifier ErrorBoundary
console.log('[1/3] Vérification ErrorBoundary...');
const errorBoundaryPath = path.join(SRC_DIR, 'components', 'ErrorBoundary.tsx');

if (!fs.existsSync(errorBoundaryPath)) {
  console.log('  ❌ ErrorBoundary manquant - CRÉATION...');
  
  const errorBoundaryCode = `import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '0.5rem',
            maxWidth: '600px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h1 style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '1.5rem' }}>
              ⚠️ Une erreur s'est produite
            </h1>
            <pre style={{
              backgroundColor: '#fef2f2',
              padding: '1rem',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              overflow: 'auto'
            }}>
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem',
                backgroundColor: '#A93200',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.25rem',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;`;
  
  fs.mkdirSync(path.dirname(errorBoundaryPath), { recursive: true });
  fs.writeFileSync(errorBoundaryPath, errorBoundaryCode, 'utf8');
  console.log('  ✓ ErrorBoundary créé');
  fixes++;
} else {
  console.log('  ✓ ErrorBoundary existe');
}

// 2. Vérifier ProtectedRoute
console.log('\n[2/3] Vérification ProtectedRoute...');
const protectedRoutePath = path.join(SRC_DIR, 'components', 'layout', 'ProtectedRoute.tsx');

if (!fs.existsSync(protectedRoutePath)) {
  console.log('  ❌ ProtectedRoute manquant - CRÉATION...');
  
  const protectedRouteCode = `import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { currentUser } = useAuthStore();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};`;
  
  fs.mkdirSync(path.dirname(protectedRoutePath), { recursive: true });
  fs.writeFileSync(protectedRoutePath, protectedRouteCode, 'utf8');
  console.log('  ✓ ProtectedRoute créé');
  fixes++;
} else {
  console.log('  ✓ ProtectedRoute existe');
}

// 3. Vérifier index.html
console.log('\n[3/3] Vérification index.html...');
const indexPath = path.join(PROJECT_ROOT, 'index.html');

if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  const originalContent = indexContent;
  
  // Vérifier que le div root existe
  if (!indexContent.includes('id="root"')) {
    console.log('  ❌ div#root manquant - AJOUT...');
    indexContent = indexContent.replace(
      '<body>',
      '<body>\n    <div id="root"></div>'
    );
    fixes++;
  }
  
  // Vérifier que le script existe
  if (!indexContent.includes('src/main.tsx') && !indexContent.includes('src/main.ts')) {
    console.log('  ❌ Script main.tsx manquant - AJOUT...');
    indexContent = indexContent.replace(
      '</body>',
      '    <script type="module" src="/src/main.tsx"></script>\n  </body>'
    );
    fixes++;
  }
  
  // Vérifier le doctype
  if (!indexContent.toLowerCase().includes('<!doctype html>')) {
    console.log('  ⚠️  DOCTYPE manquant - AJOUT...');
    indexContent = '<!doctype html>\n' + indexContent;
    fixes++;
  }
  
  if (indexContent !== originalContent) {
    fs.writeFileSync(indexPath, indexContent, 'utf8');
    console.log('  ✓ index.html corrigé');
  } else {
    console.log('  ✓ index.html OK');
  }
} else {
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
  fixes++;
}

console.log('\n=== VÉRIFICATION TERMINÉE ===\n');

if (fixes > 0) {
  console.log(`✓ ${fixes} correction(s) appliquée(s)`);
  console.log('\nPROCHAINES ÉTAPES:');
  console.log('  1. Arrêter le serveur (Ctrl+C)');
  console.log('  2. Relancer: npm run dev');
  console.log('  3. Rafraîchir le navigateur (F5)\n');
} else {
  console.log('✓ Tous les composants sont OK');
  console.log('\nLE PROBLÈME DOIT ÊTRE AILLEURS. Vérifions:');
  console.log('  1. Vérifier que le serveur tourne vraiment sur port 8080');
  console.log('  2. Essayer: http://127.0.0.1:8080 au lieu de localhost');
  console.log('  3. Vider le cache du navigateur (Ctrl+Shift+Del)\n');
  
  console.log('OU essayer cette commande pour voir les logs détaillés:');
  console.log('  npm run dev -- --debug\n');
}

// Créer un fichier de test simple
console.log('Création d\'une page de test simple...');
const testHtmlPath = path.join(PROJECT_ROOT, 'test.html');
const testHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Test ShopNova</title>
</head>
<body style="font-family: system-ui; padding: 2rem; text-align: center;">
  <h1 style="color: #A93200;">✅ Serveur Vite fonctionne !</h1>
  <p>Si vous voyez cette page sur <code>http://localhost:8080/test.html</code></p>
  <p>Alors Vite sert correctement les fichiers.</p>
  <hr style="margin: 2rem 0;">
  <p><strong>Le problème est dans le code React.</strong></p>
  <p>Vérifiez la console du navigateur (F12) pour voir les erreurs exactes.</p>
</body>
</html>`;

fs.writeFileSync(testHtmlPath, testHtml, 'utf8');
console.log(`✓ Fichier de test créé: test.html`);
console.log(`  Testez: http://localhost:8080/test.html\n`);
