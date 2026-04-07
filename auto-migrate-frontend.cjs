#!/usr/bin/env node

/**
 * SHOPNOVA DESIGN MIGRATION - SCRIPT AUTOMATIQUE
 * Ce script transforme automatiquement tout le code frontend
 * pour appliquer le nouveau design system
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

log('================================================================', 'cyan');
log('     SHOPNOVA DESIGN MIGRATION - AUTOMATIC CODE TRANSFORM      ', 'cyan');
log('================================================================', 'cyan');
console.log();

// Configuration
const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const PAGES_DIR = path.join(SRC_DIR, 'pages');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');

// Compteurs
let filesProcessed = 0;
let modificationsCount = 0;

/**
 * Transformations à appliquer sur le code
 */
const CODE_TRANSFORMATIONS = [
  // 1. BORDERS -> Tonal Layering
  {
    name: 'Supprimer borders et remplacer par surface-container-lowest',
    pattern: /className="([^"]*)\bborder\s+border-gray-200\b([^"]*)"/g,
    replacement: 'className="$1surface-container-lowest$2"',
  },
  {
    name: 'Supprimer border-neutral',
    pattern: /className="([^"]*)\bborder\s+border-neutral-\d+\b([^"]*)"/g,
    replacement: 'className="$1surface-container-lowest$2"',
  },
  {
    name: 'Supprimer border seul',
    pattern: /className="([^"]*)\bborder\b([^"]*)"/g,
    replacement: 'className="$1$2"',
  },
  
  // 2. COULEURS - Violet -> Terra Cotta
  {
    name: 'bg-violet -> bg-primary',
    pattern: /\bbg-violet-(\d+)\b/g,
    replacement: (match, shade) => {
      const shadeMap = {
        '50': 'bg-primary-50',
        '100': 'bg-primary-100',
        '500': 'bg-primary-500',
        '600': 'bg-primary-600',
        '700': 'bg-primary-700',
      };
      return shadeMap[shade] || 'bg-primary-500';
    }
  },
  {
    name: 'text-violet -> text-primary',
    pattern: /\btext-violet-(\d+)\b/g,
    replacement: (match, shade) => {
      const shadeMap = {
        '600': 'text-primary-600',
        '700': 'text-primary-700',
        '800': 'text-primary-800',
      };
      return shadeMap[shade] || 'text-primary-600';
    }
  },
  {
    name: 'bg-purple -> bg-primary',
    pattern: /\bbg-purple-(\d+)\b/g,
    replacement: (match, shade) => {
      const shadeMap = {
        '50': 'bg-primary-50',
        '100': 'bg-primary-100',
        '500': 'bg-primary-500',
        '600': 'bg-primary-600',
      };
      return shadeMap[shade] || 'bg-primary-500';
    }
  },
  {
    name: 'Remplacer code couleur violet hexadécimal',
    pattern: /bg-\[#6C63FF\]/g,
    replacement: 'bg-primary-500',
  },
  
  // 3. CERCLES -> Carrés arrondis
  {
    name: 'rounded-full -> rounded-lg (sauf avatars)',
    pattern: /className="([^"]*(?:w-\d+|h-\d+)[^"]*)\brounded-full\b([^"]*)"/g,
    replacement: (match, before, after) => {
      // Garder rounded-full pour les avatars (détection simplifiée)
      if (before.includes('avatar') || after.includes('avatar')) {
        return match;
      }
      return `className="${before}rounded-lg${after}"`;
    }
  },
  
  // 4. BG-WHITE -> Surface Container
  {
    name: 'bg-white avec border -> surface-container-lowest',
    pattern: /className="([^"]*)\bbg-white\b([^"]*)\bborder\b([^"]*)"/g,
    replacement: 'className="$1surface-container-lowest$2$3"',
  },
  
  // 5. SHADOW -> Suppression (sauf floating elements)
  {
    name: 'Supprimer shadow-sm/md/lg',
    pattern: /\bshadow-(sm|md|lg)\b/g,
    replacement: '',
  },
  
  // 6. TYPOGRAPHIE
  {
    name: 'text-3xl -> text-display-md',
    pattern: /\btext-3xl\b/g,
    replacement: 'text-display-md',
  },
  {
    name: 'text-2xl -> text-headline-lg',
    pattern: /\btext-2xl\b/g,
    replacement: 'text-headline-lg',
  },
  {
    name: 'text-xl -> text-title-lg',
    pattern: /\btext-xl\b/g,
    replacement: 'text-title-lg',
  },
  
  // 7. SPACING - Normaliser vers système 8px
  {
    name: 'gap-3 -> gap-grid (8px)',
    pattern: /\bgap-3\b/g,
    replacement: 'gap-grid',
  },
  {
    name: 'gap-6 -> gap-grid-3 (24px)',
    pattern: /\bgap-6\b/g,
    replacement: 'gap-grid-3',
  },
  
  // 8. BOUTONS
  {
    name: 'Boutons violet -> primary',
    pattern: /className="([^"]*)\bbg-violet-600\s+text-white\b([^"]*)"/g,
    replacement: 'className="$1btn-primary$2"',
  },
];

/**
 * Appliquer les transformations sur un fichier
 */
function transformFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    let fileModifications = 0;
    
    CODE_TRANSFORMATIONS.forEach(transformation => {
      if (typeof transformation.replacement === 'function') {
        const matches = content.match(transformation.pattern);
        if (matches) {
          content = content.replace(transformation.pattern, transformation.replacement);
          if (content !== originalContent) {
            fileModifications++;
          }
        }
      } else {
        const newContent = content.replace(transformation.pattern, transformation.replacement);
        if (newContent !== content) {
          fileModifications++;
          content = newContent;
        }
      }
    });
    
    // Nettoyer les espaces multiples dans className
    content = content.replace(/className="([^"]*)"/g, (match, classes) => {
      const cleaned = classes.replace(/\s+/g, ' ').trim();
      return `className="${cleaned}"`;
    });
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      log(`  ✓ ${path.relative(PROJECT_ROOT, filePath)} (${fileModifications} transformations)`, 'green');
      modificationsCount += fileModifications;
      return true;
    }
    
    return false;
  } catch (error) {
    log(`  ✗ Erreur dans ${path.relative(PROJECT_ROOT, filePath)}: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Parcourir récursivement un dossier
 */
function processDirectory(dir, filePattern = /\.(tsx|ts|jsx|js)$/) {
  if (!fs.existsSync(dir)) {
    return;
  }
  
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Ignorer node_modules, dist, build
      if (!['node_modules', 'dist', 'build', '.git'].includes(file)) {
        processDirectory(filePath, filePattern);
      }
    } else if (filePattern.test(file)) {
      filesProcessed++;
      transformFile(filePath);
    }
  });
}

/**
 * Ajouter les imports nécessaires dans les fichiers qui utilisent les nouveaux composants
 */
function addImportsIfNeeded(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Vérifier si StatusBadge est utilisé mais pas importé
  if (content.includes('<StatusBadge') && !content.includes('import { StatusBadge }')) {
    const importLine = 'import { StatusBadge } from "@/components/ui/StatusBadge";\n';
    content = content.replace(/(import.*from.*;\n)/, `$1${importLine}`);
  }
  
  // PaymentBadge
  if (content.includes('<PaymentBadge') && !content.includes('import { PaymentBadge }')) {
    const importLine = 'import { PaymentBadge } from "@/components/ui/PaymentBadge";\n';
    content = content.replace(/(import.*from.*;\n)/, `$1${importLine}`);
  }
  
  // ProgressBar
  if (content.includes('<ProgressBar') && !content.includes('import { ProgressBar }')) {
    const importLine = 'import { ProgressBar } from "@/components/ui/ProgressBar";\n';
    content = content.replace(/(import.*from.*;\n)/, `$1${importLine}`);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    log(`  + Imports ajoutés dans ${path.relative(PROJECT_ROOT, filePath)}`, 'cyan');
  }
}

/**
 * MAIN EXECUTION
 */
async function main() {
  console.log();
  log('[1/4] Traitement des pages...', 'cyan');
  processDirectory(PAGES_DIR);
  
  console.log();
  log('[2/4] Traitement des composants...', 'cyan');
  processDirectory(COMPONENTS_DIR);
  
  console.log();
  log('[3/4] Ajout des imports nécessaires...', 'cyan');
  if (fs.existsSync(PAGES_DIR)) {
    fs.readdirSync(PAGES_DIR)
      .filter(file => /\.tsx$/.test(file))
      .forEach(file => addImportsIfNeeded(path.join(PAGES_DIR, file)));
  }
  
  console.log();
  log('[4/4] Vérification finale...', 'cyan');
  log(`  ✓ ${filesProcessed} fichiers traités`, 'green');
  log(`  ✓ ${modificationsCount} modifications appliquées`, 'green');
  
  console.log();
  log('================================================================', 'green');
  log('                  MIGRATION TERMINÉE !                          ', 'green');
  log('================================================================', 'green');
  console.log();
  
  log('Prochaines étapes:', 'yellow');
  log('  1. Vérifier le code modifié avec: git diff', 'yellow');
  log('  2. Tester l\'application: npm run dev', 'yellow');
  log('  3. Si erreurs, annuler avec: git checkout .', 'yellow');
  console.log();
  
  log('MODIFICATIONS APPLIQUÉES:', 'cyan');
  log('  ✓ Borders supprimées → surface-container-lowest', 'green');
  log('  ✓ Violet/Purple → Terra Cotta (primary-500)', 'green');
  log('  ✓ rounded-full → rounded-lg', 'green');
  log('  ✓ Typographie modernisée', 'green');
  log('  ✓ Spacing normalisé (système 8px)', 'green');
  console.log();
  
  log('NOTE:', 'yellow');
  log('  Certains ajustements manuels peuvent être nécessaires.', 'yellow');
  log('  Consultez SHOPNOVA-REFONTE-COMPLETE.md pour plus de détails.', 'yellow');
  console.log();
}

// Exécuter
main().catch(error => {
  log('ERREUR:', 'red');
  console.error(error);
  process.exit(1);
});
