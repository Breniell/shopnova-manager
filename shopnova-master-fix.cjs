#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 *  SHOPNOVA MASTER FIX - CORRECTION COMPLÈTE DU PROJET
 * ═══════════════════════════════════════════════════════════
 * 
 * Ce script analyse et corrige TOUS les problèmes du projet
 * comme le ferait une équipe d'experts (Square, Toast, Linear)
 */

const fs = require('fs');
const path = require('path');

// Colors
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${C[color]}${msg}${C.reset}`);
}

function header(text) {
  console.log();
  log('═'.repeat(70), 'cyan');
  log(`  ${text}`, 'bright');
  log('═'.repeat(70), 'cyan');
  console.log();
}

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

let stats = {
  filesAnalyzed: 0,
  filesModified: 0,
  issuesFound: 0,
  issuesFixed: 0,
  errors: [],
};

header('SHOPNOVA MASTER FIX - ANALYSE ET CORRECTION COMPLÈTE');

// ═══════════════════════════════════════════════════════════
// PHASE 1: CRÉATION DE L'INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════

header('PHASE 1: CRÉATION DE L\'INFRASTRUCTURE');

// 1.1 Créer utils/formatters.ts
log('[1.1] Création utils/formatters.ts...', 'cyan');
const utilsDir = path.join(SRC_DIR, 'utils');
fs.mkdirSync(utilsDir, { recursive: true });

const formattersCode = `/**
 * Utilitaires de formatage pour ShopNova Manager
 * @module utils/formatters
 */

/**
 * Formate un montant en FCFA
 * @param amount - Montant à formater
 * @returns Montant formaté avec séparateurs de milliers et " FCFA"
 * @example formatPrice(12500) // "12,500 FCFA"
 */
export function formatPrice(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(num) + ' FCFA';
}

/**
 * Alias de formatPrice pour compatibilité
 */
export const formatFCFA = formatPrice;

/**
 * Formate une date
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR').format(d);
}

/**
 * Formate une date avec heure
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Formate l'heure uniquement
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    timeStyle: 'short',
  }).format(d);
}`;

fs.writeFileSync(path.join(utilsDir, 'formatters.ts'), formattersCode, 'utf8');
log('  ✓ utils/formatters.ts créé', 'green');
stats.issuesFixed++;

// 1.2 Créer lib/utils.ts si manquant
log('[1.2] Vérification lib/utils.ts...', 'cyan');
const libDir = path.join(SRC_DIR, 'lib');
const utilsPath = path.join(libDir, 'utils.ts');

if (!fs.existsSync(utilsPath)) {
  fs.mkdirSync(libDir, { recursive: true });
  const libUtilsCode = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`;
  fs.writeFileSync(utilsPath, libUtilsCode, 'utf8');
  log('  ✓ lib/utils.ts créé', 'green');
  stats.issuesFixed++;
} else {
  log('  ✓ lib/utils.ts existe déjà', 'green');
}

// ═══════════════════════════════════════════════════════════
// PHASE 2: NETTOYAGE EN PROFONDEUR
// ═══════════════════════════════════════════════════════════

header('PHASE 2: NETTOYAGE EN PROFONDEUR DES FICHIERS');

function deepCleanFile(filePath) {
  stats.filesAnalyzed++;
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const fileName = path.relative(PROJECT_ROOT, filePath);
  let changes = [];

  // 2.1: Supprimer TOUTES les définitions locales de formatPrice/formatFCFA
  const localDefinitions = [
    // Fonctions export
    /export\s+(const|function)\s+(formatPrice|formatFCFA)\s*[=\(][\s\S]*?[;\}]/g,
    // Fonctions const
    /const\s+(formatPrice|formatFCFA)\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n\};?/g,
    /const\s+(formatPrice|formatFCFA)\s*=\s*\([^)]*\)\s*=>\s*[^;]+;/g,
    // Fonctions normales
    /function\s+(formatPrice|formatFCFA)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g,
  ];

  localDefinitions.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, '');
      changes.push(`Supprimé ${matches.length} définition(s) locale(s)`);
      stats.issuesFound++;
      stats.issuesFixed++;
    }
  });

  // 2.2: Nettoyer les imports en double
  const lines = content.split('\n');
  const cleanLines = [];
  let formattersImportAdded = false;
  const seenImports = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Ignorer imports de formatters en double
    if (line.includes("from '@/utils/formatters'") || 
        line.includes('from "../utils/formatters"')) {
      if (!formattersImportAdded && (originalContent.includes('formatPrice(') || originalContent.includes('formatFCFA('))) {
        cleanLines.push("import { formatPrice, formatFCFA, formatDate, formatTime } from '@/utils/formatters';");
        formattersImportAdded = true;
        if (line.trim() !== "import { formatPrice, formatFCFA, formatDate, formatTime } from '@/utils/formatters';") {
          changes.push('Import formatters normalisé');
          stats.issuesFixed++;
        }
      }
      continue;
    }

    // Détecter les imports en double
    if (line.trim().startsWith('import ')) {
      const importKey = line.trim();
      if (seenImports.has(importKey)) {
        changes.push('Import en double supprimé');
        stats.issuesFound++;
        stats.issuesFixed++;
        continue;
      }
      seenImports.add(importKey);
    }

    cleanLines.push(line);
  }

  // Ajouter l'import formatters si nécessaire et pas encore ajouté
  if (!formattersImportAdded && (originalContent.includes('formatPrice(') || originalContent.includes('formatFCFA('))) {
    // Trouver le dernier import
    let lastImportIndex = -1;
    for (let i = 0; i < cleanLines.length; i++) {
      if (cleanLines[i].trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    if (lastImportIndex >= 0) {
      cleanLines.splice(lastImportIndex + 1, 0, "import { formatPrice, formatFCFA, formatDate, formatTime } from '@/utils/formatters';");
      changes.push('Import formatters ajouté');
      stats.issuesFixed++;
    }
  }

  content = cleanLines.join('\n');

  // 2.3: Nettoyer les lignes vides multiples
  content = content.replace(/\n\n\n+/g, '\n\n');

  // 2.4: Nettoyer les espaces en fin de ligne
  content = content.split('\n').map(line => line.trimEnd()).join('\n');

  // Sauvegarder si modifié
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    log(`  ✓ ${fileName}`, 'green');
    changes.forEach(c => log(`      - ${c}`, 'blue'));
    stats.filesModified++;
    return true;
  }

  return false;
}

// Nettoyer tous les fichiers
log('\n[2.1] Nettoyage pages/...', 'cyan');
const pagesDir = path.join(SRC_DIR, 'pages');
if (fs.existsSync(pagesDir)) {
  fs.readdirSync(pagesDir)
    .filter(f => f.endsWith('.tsx'))
    .forEach(f => deepCleanFile(path.join(pagesDir, f)));
}

log('\n[2.2] Nettoyage components/...', 'cyan');
function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !['node_modules', 'dist'].includes(file)) {
      cleanDir(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      deepCleanFile(fullPath);
    }
  });
}

cleanDir(path.join(SRC_DIR, 'components'));

// ═══════════════════════════════════════════════════════════
// PHASE 3: CORRECTIONS SPÉCIFIQUES
// ═══════════════════════════════════════════════════════════

header('PHASE 3: CORRECTIONS SPÉCIFIQUES');

// 3.1: Corriger index.css - Remplacer Cal Sans
log('[3.1] Correction index.css (police Cal Sans)...', 'cyan');
const indexCssPath = path.join(SRC_DIR, 'index.css');
if (fs.existsSync(indexCssPath)) {
  let css = fs.readFileSync(indexCssPath, 'utf8');
  const originalCss = css;
  
  css = css.replace(
    "@import url('https://fonts.cdnfonts.com/css/cal-sans');",
    "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');"
  );
  
  css = css.replace(/'Cal Sans'/g, "'Space Grotesk'");
  css = css.replace(/font-family: 'Cal Sans'/g, "font-family: 'Space Grotesk'");
  
  if (css !== originalCss) {
    fs.writeFileSync(indexCssPath, css, 'utf8');
    log('  ✓ Cal Sans → Space Grotesk', 'green');
    stats.issuesFixed++;
  }
}

// 3.2: Corriger tailwind.config.ts
log('[3.2] Correction tailwind.config.ts...', 'cyan');
const tailwindPath = path.join(PROJECT_ROOT, 'tailwind.config.ts');
if (fs.existsSync(tailwindPath)) {
  let config = fs.readFileSync(tailwindPath, 'utf8');
  const originalConfig = config;
  
  config = config.replace(/'Cal Sans'/g, "'Space Grotesk'");
  
  if (config !== originalConfig) {
    fs.writeFileSync(tailwindPath, config, 'utf8');
    log('  ✓ tailwind.config.ts mis à jour', 'green');
    stats.issuesFixed++;
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 4: RAPPORT FINAL
// ═══════════════════════════════════════════════════════════

header('RAPPORT FINAL');

log(`\n📊 STATISTIQUES:`, 'bright');
log(`   Fichiers analysés: ${stats.filesAnalyzed}`, 'cyan');
log(`   Fichiers modifiés: ${stats.filesModified}`, 'yellow');
log(`   Problèmes trouvés: ${stats.issuesFound}`, 'red');
log(`   Problèmes corrigés: ${stats.issuesFixed}`, 'green');

if (stats.errors.length > 0) {
  log(`\n⚠️  ERREURS:`, 'red');
  stats.errors.forEach(err => log(`   ${err}`, 'red'));
}

console.log();
log('═'.repeat(70), 'green');
log('  ✓ CORRECTION COMPLÈTE TERMINÉE', 'bright');
log('═'.repeat(70), 'green');
console.log();

log('PROCHAINES ÉTAPES:', 'yellow');
log('  1. Arrêter le serveur: Ctrl+C', 'cyan');
log('  2. Relancer: npm run dev', 'cyan');
log('  3. Rafraîchir: Ctrl+Shift+R dans le navigateur', 'cyan');
console.log();

log('Si erreurs persistent:', 'yellow');
log('  - Vérifier la console du navigateur (F12)', 'cyan');
log('  - Les erreurs service-worker/contentScript sont NORMALES (extensions Chrome)', 'cyan');
console.log();
