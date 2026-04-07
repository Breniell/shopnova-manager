const fs = require('fs');
const path = require('path');

console.log('=== NETTOYAGE DES DOUBLONS ===\n');

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
let fixes = 0;

function cleanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  let modified = false;
  
  // 1. Supprimer les définitions locales de formatPrice/formatFCFA
  const localFunctionPatterns = [
    /const\s+formatPrice\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\};?/g,
    /function\s+formatPrice\s*\([^)]*\)\s*\{[^}]*\}/g,
    /const\s+formatFCFA\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\};?/g,
    /function\s+formatFCFA\s*\([^)]*\)\s*\{[^}]*\}/g,
  ];
  
  localFunctionPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      content = content.replace(pattern, '');
      modified = true;
      console.log(`  - Suppression définition locale dans ${path.basename(filePath)}`);
    }
  });
  
  // 2. Nettoyer les imports en double
  const lines = content.split('\n');
  const importLines = [];
  const cleanedLines = [];
  let hasFormattersImport = false;
  
  for (const line of lines) {
    if (line.trim().startsWith('import ')) {
      // Vérifier si c'est un import de formatters
      if (line.includes("from '@/utils/formatters'") || line.includes('from "../utils/formatters"')) {
        if (!hasFormattersImport) {
          // Garder seulement le premier import
          cleanedLines.push("import { formatPrice, formatFCFA } from '@/utils/formatters';");
          hasFormattersImport = true;
        }
        // Ignorer les imports suivants
      } else {
        cleanedLines.push(line);
      }
    } else {
      cleanedLines.push(line);
    }
  }
  
  content = cleanedLines.join('\n');
  
  // 3. Nettoyer les lignes vides multiples
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ ${path.basename(filePath)} nettoyé`);
    return true;
  }
  
  return false;
}

// Nettoyer DashboardPage.tsx spécifiquement
console.log('[1/2] Nettoyage de DashboardPage.tsx...');
const dashboardPath = path.join(SRC_DIR, 'pages', 'DashboardPage.tsx');

if (fs.existsSync(dashboardPath)) {
  if (cleanFile(dashboardPath)) {
    fixes++;
  }
} else {
  console.log('  ⚠️  DashboardPage.tsx non trouvé');
}

// Nettoyer tous les autres fichiers aussi
console.log('\n[2/2] Nettoyage de tous les fichiers...');

function cleanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !['node_modules', 'dist', 'build'].includes(file)) {
      cleanDirectory(filePath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      if (cleanFile(filePath)) {
        fixes++;
      }
    }
  });
}

const pagesDir = path.join(SRC_DIR, 'pages');
const componentsDir = path.join(SRC_DIR, 'components');

cleanDirectory(pagesDir);
cleanDirectory(componentsDir);

console.log('\n=== NETTOYAGE TERMINÉ ===\n');
console.log(`✓ ${fixes} fichier(s) nettoyé(s)\n`);

console.log('PROCHAINES ÉTAPES:');
console.log('  1. Rafraîchir le navigateur (Ctrl+Shift+R pour forcer)');
console.log('  2. Si erreur persiste, vider le cache Vite:');
console.log('     Remove-Item -Recurse -Force node_modules/.vite');
console.log('     npm run dev\n');

console.log('NOTE: Les erreurs "service-worker" et "contentScript"');
console.log('      sont normales (extensions Chrome) et peuvent être ignorées.\n');
