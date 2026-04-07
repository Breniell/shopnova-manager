const fs = require('fs');
const path = require('path');

console.log('=======================================================');
console.log('   NETTOYAGE EN PROFONDEUR - formatPrice/formatFCFA   ');
console.log('=======================================================\n');

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
let totalFixes = 0;

/**
 * Nettoie un fichier en profondeur
 */
function deepCleanFile(filePath) {
  const fileName = path.relative(PROJECT_ROOT, filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fileChanges = [];
  
  // ÉTAPE 1: Supprimer TOUTES les définitions locales de formatPrice/formatFCFA
  const definitionPatterns = [
    // Fonctions fléchées
    /export\s+const\s+formatPrice\s*=.*?;/gs,
    /const\s+formatPrice\s*=.*?;/gs,
    /export\s+const\s+formatFCFA\s*=.*?;/gs,
    /const\s+formatFCFA\s*=.*?;/gs,
    
    // Fonctions normales
    /export\s+function\s+formatPrice\s*\([^)]*\)\s*\{[^}]*\}/gs,
    /function\s+formatPrice\s*\([^)]*\)\s*\{[^}]*\}/gs,
    /export\s+function\s+formatFCFA\s*\([^)]*\)\s*\{[^}]*\}/gs,
    /function\s+formatFCFA\s*\([^)]*\)\s*\{[^}]*\}/gs,
    
    // Fonctions avec return multiligne
    /const\s+formatPrice\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?return[\s\S]*?\};/g,
    /const\s+formatFCFA\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?return[\s\S]*?\};/g,
    
    // Fonctions one-liner
    /const\s+formatPrice\s*=\s*\([^)]*\)\s*=>\s*[^;]+;/g,
    /const\s+formatFCFA\s*=\s*\([^)]*\)\s*=>\s*[^;]+;/g,
  ];
  
  definitionPatterns.forEach((pattern, index) => {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      content = content.replace(pattern, '');
      fileChanges.push(`Supprimé ${matches.length} définition(s) locale(s) (pattern ${index + 1})`);
    }
  });
  
  // ÉTAPE 2: Supprimer TOUS les imports de formatters et les recréer proprement
  const lines = content.split('\n');
  const newLines = [];
  let importFromFormattersFound = false;
  let importLineAdded = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Ignorer les lignes d'import de formatters
    if (line.includes("from '@/utils/formatters'") || 
        line.includes('from "../utils/formatters"') ||
        line.includes('from "../../utils/formatters"') ||
        line.includes('from "./utils/formatters"')) {
      importFromFormattersFound = true;
      // Ne pas ajouter cette ligne (on va recréer l'import plus tard)
      continue;
    }
    
    // Ajouter l'import propre après le dernier import existant
    if (line.trim().startsWith('import ') && !importLineAdded) {
      newLines.push(line);
      
      // Si c'est le dernier import, ajouter notre import juste après
      const nextLine = lines[i + 1];
      if (!nextLine || !nextLine.trim().startsWith('import ')) {
        // Vérifier si le fichier utilise formatPrice ou formatFCFA
        if (originalContent.includes('formatPrice(') || originalContent.includes('formatFCFA(')) {
          newLines.push("import { formatPrice, formatFCFA } from '@/utils/formatters';");
          importLineAdded = true;
          fileChanges.push('Import propre ajouté');
        }
      }
    } else {
      newLines.push(line);
    }
  }
  
  content = newLines.join('\n');
  
  // ÉTAPE 3: Nettoyer les lignes vides multiples
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  // ÉTAPE 4: Nettoyer les espaces en fin de ligne
  content = content.split('\n').map(line => line.trimEnd()).join('\n');
  
  // Sauvegarder si modifié
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ ${fileName}`);
    fileChanges.forEach(change => console.log(`    - ${change}`));
    return fileChanges.length;
  }
  
  return 0;
}

/**
 * Parcourt récursivement un dossier
 */
function cleanDirectory(dir, label) {
  if (!fs.existsSync(dir)) {
    console.log(`⚠️  Dossier ${label} non trouvé: ${dir}\n`);
    return;
  }
  
  console.log(`\n[Nettoyage ${label}]`);
  
  let dirFixes = 0;
  
  function processDir(currentDir) {
    const files = fs.readdirSync(currentDir);
    
    files.forEach(file => {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        if (!['node_modules', 'dist', 'build', '.git'].includes(file)) {
          processDir(filePath);
        }
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        const fixes = deepCleanFile(filePath);
        dirFixes += fixes;
        totalFixes += fixes;
      }
    });
  }
  
  processDir(dir);
  
  if (dirFixes === 0) {
    console.log('  Aucune modification nécessaire');
  }
}

// Nettoyer les dossiers
cleanDirectory(path.join(SRC_DIR, 'pages'), 'PAGES');
cleanDirectory(path.join(SRC_DIR, 'components'), 'COMPOSANTS');
cleanDirectory(path.join(SRC_DIR, 'store'), 'STORES');

console.log('\n=======================================================');
console.log(`   NETTOYAGE TERMINÉ - ${totalFixes} modification(s)    `);
console.log('=======================================================\n');

if (totalFixes > 0) {
  console.log('✅ CORRECTIONS APPLIQUÉES\n');
  console.log('PROCHAINES ÉTAPES:');
  console.log('  1. Arrêter le serveur (Ctrl+C dans le terminal npm run dev)');
  console.log('  2. Supprimer le cache Vite:');
  console.log('     Remove-Item -Recurse -Force node_modules\\.vite');
  console.log('  3. Relancer: npm run dev');
  console.log('  4. Rafraîchir le navigateur: Ctrl+Shift+R\n');
} else {
  console.log('ℹ️  Aucune modification nécessaire\n');
  console.log('Si vous avez toujours des erreurs:');
  console.log('  1. Vérifier la console du navigateur');
  console.log('  2. Copier l\'erreur exacte');
  console.log('  3. Vérifier le fichier incriminé manuellement\n');
}

// Vérifier que utils/formatters.ts existe
const formattersPath = path.join(SRC_DIR, 'utils', 'formatters.ts');
if (!fs.existsSync(formattersPath)) {
  console.log('⚠️  ATTENTION: utils/formatters.ts n\'existe pas!');
  console.log('   Exécutez d\'abord: node fix-formatprice-error.cjs\n');
}
