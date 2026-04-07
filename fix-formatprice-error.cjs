const fs = require('fs');
const path = require('path');

console.log('=== CORRECTION AUTOMATIQUE DES ERREURS ===\n');

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
let fixes = 0;

// 1. Créer le fichier utils/formatters.ts avec formatPrice
console.log('[1/4] Création des fonctions de formatage...');
const utilsDir = path.join(SRC_DIR, 'utils');
const formattersPath = path.join(utilsDir, 'formatters.ts');

fs.mkdirSync(utilsDir, { recursive: true });

const formattersCode = `/**
 * Fonctions de formatage pour ShopNova Manager
 */

/**
 * Formate un nombre en prix FCFA
 * @param amount - Montant à formater
 * @returns Prix formaté (ex: "12,500 FCFA")
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

/**
 * Formate un nombre en prix FCFA (alias)
 */
export function formatFCFA(amount: number): string {
  return formatPrice(amount);
}

/**
 * Formate une date en français
 * @param date - Date à formater
 * @returns Date formatée (ex: "07/04/2026")
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR').format(d);
}

/**
 * Formate une date avec heure
 * @param date - Date à formater
 * @returns Date et heure formatées (ex: "07/04/2026 14:30")
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Formate un pourcentage
 * @param value - Valeur décimale (0.15 = 15%)
 * @returns Pourcentage formaté (ex: "15%")
 */
export function formatPercentage(value: number): string {
  return (value * 100).toFixed(1) + '%';
}`;

fs.writeFileSync(formattersPath, formattersCode, 'utf8');
console.log('  ✓ utils/formatters.ts créé avec formatPrice, formatFCFA, etc.');
fixes++;

// 2. Ajouter l'import dans tous les fichiers qui utilisent formatPrice
console.log('\n[2/4] Ajout automatique des imports formatPrice...');

function addFormatPriceImport(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Vérifier si le fichier utilise formatPrice ou formatFCFA
  if ((content.includes('formatPrice(') || content.includes('formatFCFA(')) && 
      !content.includes("from '@/utils/formatters'") &&
      !content.includes('from "../utils/formatters"')) {
    
    // Trouver la dernière ligne d'import
    const lines = content.split('\n');
    let lastImportIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    
    if (lastImportIndex >= 0) {
      const importLine = "import { formatPrice, formatFCFA } from '@/utils/formatters';";
      lines.splice(lastImportIndex + 1, 0, importLine);
      content = lines.join('\n');
      
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`  ✓ Import ajouté dans ${path.basename(filePath)}`);
      return true;
    }
  }
  
  return false;
}

// Parcourir tous les fichiers .tsx dans pages/
const pagesDir = path.join(SRC_DIR, 'pages');
if (fs.existsSync(pagesDir)) {
  fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.tsx'))
    .forEach(file => {
      if (addFormatPriceImport(path.join(pagesDir, file))) {
        fixes++;
      }
    });
}

// Parcourir aussi components/
const componentsDir = path.join(SRC_DIR, 'components');
function processComponentsDir(dir) {
  if (!fs.existsSync(dir)) return;
  
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processComponentsDir(filePath);
    } else if (file.endsWith('.tsx')) {
      if (addFormatPriceImport(filePath)) {
        fixes++;
      }
    }
  });
}

processComponentsDir(componentsDir);

// 3. Corriger le problème de la police Cal Sans dans index.css
console.log('\n[3/4] Correction de la police Cal Sans...');
const indexCssPath = path.join(SRC_DIR, 'index.css');

if (fs.existsSync(indexCssPath)) {
  let css = fs.readFileSync(indexCssPath, 'utf8');
  
  // Remplacer l'import Cal Sans par une alternative gratuite
  if (css.includes("@import url('https://fonts.cdnfonts.com/css/cal-sans')")) {
    css = css.replace(
      "@import url('https://fonts.cdnfonts.com/css/cal-sans');",
      "/* Cal Sans remplacée par Space Grotesk (alternative gratuite) */\n@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');"
    );
    
    // Remplacer Cal Sans par Space Grotesk dans font-display
    css = css.replace(
      /font-display:.*'Cal Sans'.*/g,
      "font-display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],"
    );
    
    css = css.replace(
      /font-family:.*'Cal Sans'.*/g,
      "font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;"
    );
    
    fs.writeFileSync(indexCssPath, css, 'utf8');
    console.log('  ✓ Cal Sans remplacée par Space Grotesk (gratuite)');
    fixes++;
  } else {
    console.log('  ✓ Police déjà OK ou Cal Sans déjà remplacée');
  }
}

// 4. Mettre à jour tailwind.config.ts aussi
console.log('\n[4/4] Mise à jour tailwind.config.ts...');
const tailwindPath = path.join(PROJECT_ROOT, 'tailwind.config.ts');

if (fs.existsSync(tailwindPath)) {
  let config = fs.readFileSync(tailwindPath, 'utf8');
  
  if (config.includes("'Cal Sans'")) {
    config = config.replace(
      /'Cal Sans'/g,
      "'Space Grotesk'"
    );
    
    fs.writeFileSync(tailwindPath, config, 'utf8');
    console.log('  ✓ tailwind.config.ts mis à jour');
    fixes++;
  } else {
    console.log('  ✓ tailwind.config.ts déjà OK');
  }
}

console.log('\n=== CORRECTIONS TERMINÉES ===\n');
console.log(`✓ ${fixes} correction(s) appliquée(s)\n`);

console.log('CORRECTIONS APPLIQUÉES:');
console.log('  ✓ formatPrice() créé dans utils/formatters.ts');
console.log('  ✓ Imports automatiquement ajoutés dans tous les fichiers');
console.log('  ✓ Cal Sans remplacée par Space Grotesk (gratuite)');
console.log('  ✓ Erreur 500 de la police corrigée\n');

console.log('PROCHAINES ÉTAPES:');
console.log('  1. Rafraîchir le navigateur (F5 ou Ctrl+R)');
console.log('  2. L\'application devrait maintenant fonctionner parfaitement !');
console.log('  3. Connectez-vous et testez\n');
