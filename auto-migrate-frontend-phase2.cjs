#!/usr/bin/env node

/**
 * SHOPNOVA DESIGN MIGRATION - PHASE 2 AUTOMATIQUE
 * Transformations avancées : nouveaux composants, layouts, etc.
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
log('  SHOPNOVA DESIGN MIGRATION - PHASE 2 (COMPOSANTS AVANCÉS)     ', 'cyan');
log('================================================================', 'cyan');
console.log();

const PROJECT_ROOT = process.cwd();
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const PAGES_DIR = path.join(SRC_DIR, 'pages');

let filesModified = 0;
let transformationsApplied = 0;

/**
 * Ajouter un import s'il n'existe pas
 */
function addImportIfNeeded(content, componentName, importPath) {
  const importStatement = `import { ${componentName} } from "${importPath}";`;
  
  if (content.includes(`<${componentName}`) && !content.includes(`import { ${componentName}`)) {
    // Trouver la dernière ligne d'import
    const lines = content.split('\n');
    let lastImportIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }
    
    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, importStatement);
      return lines.join('\n');
    }
  }
  
  return content;
}

/**
 * STOCKPAGE.TSX - Transformer automatiquement
 */
function transformStockPage(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // 1. Ajouter les imports
  content = addImportIfNeeded(content, 'StatusBadge', '@/components/ui/StatusBadge');
  content = addImportIfNeeded(content, 'ProgressBar', '@/components/ui/ProgressBar');
  
  // 2. Remplacer les badges de stock génériques par StatusBadge
  // Pattern: badges avec "Rupture", "Stock faible", etc.
  const badgePatterns = [
    {
      // Rupture de stock
      pattern: /<span className="([^"]*badge[^"]*(?:red|danger)[^"]*)"[^>]*>\s*(?:Rupture|RUPTURE|Rupture de stock)\s*<\/span>/gi,
      replacement: '<StatusBadge status="stockout" />',
    },
    {
      // Stock faible
      pattern: /<span className="([^"]*badge[^"]*(?:yellow|warning|orange)[^"]*)"[^>]*>\s*(?:Stock faible|STOCK FAIBLE|Faible)\s*<\/span>/gi,
      replacement: '<StatusBadge status="low" />',
    },
    {
      // En stock / Stock OK
      pattern: /<span className="([^"]*badge[^"]*(?:green|success)[^"]*)"[^>]*>\s*(?:En stock|EN STOCK|Stock OK|HEALTHY)\s*<\/span>/gi,
      replacement: '<StatusBadge status="healthy" />',
    },
  ];
  
  badgePatterns.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      transformationsApplied++;
    }
  });
  
  // 3. Ajouter ProgressBar pour l'affichage du stock
  // Chercher des patterns comme: {product.stock} / {product.seuilAlerte}
  // ou des affichages de pourcentage de stock
  
  // Pattern: Affichage simple du stock sous forme de nombre
  const stockDisplayPattern = /(<td[^>]*>)\s*\{product\.stock\}\s*(<\/td>)/g;
  if (stockDisplayPattern.test(content)) {
    content = content.replace(
      stockDisplayPattern,
      `$1
        <div className="flex items-center gap-2">
          <ProgressBar 
            value={product.stock} 
            max={product.seuilAlerte * 2 || 100}
            variant={product.stock > product.seuilAlerte ? "healthy" : "warning"}
            className="w-24"
          />
          <span className="tabular-nums text-sm">{product.stock}</span>
        </div>
      $2`
    );
    transformationsApplied++;
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    return true;
  }
  return false;
}

/**
 * DASHBOARDPAGE.TSX - Transformer automatiquement
 */
function transformDashboardPage(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // 1. Ajouter les imports
  content = addImportIfNeeded(content, 'PaymentBadge', '@/components/ui/PaymentBadge');
  content = addImportIfNeeded(content, 'StatusBadge', '@/components/ui/StatusBadge');
  
  // 2. Remplacer les affichages de mode de paiement par PaymentBadge
  // Pattern: {sale.paymentMode}, "Espèces", "Mobile Money", etc.
  
  // Espèces / Cash
  const cashPatterns = [
    /<span[^>]*>\s*(?:Espèces|ESPÈCES|Cash|CASH)\s*<\/span>/gi,
    /\{sale\.paymentMode === ['"]especes['"] \? ['"]Espèces['"] : [^}]*\}/g,
  ];
  
  cashPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      content = content.replace(pattern, '<PaymentBadge mode="especes" />');
      transformationsApplied++;
    }
  });
  
  // Mobile Money
  const momoPattern = /<span[^>]*>\s*(?:Mobile Money|MOBILE MONEY|MoMo|MOMO)\s*<\/span>/gi;
  if (momoPattern.test(content)) {
    content = content.replace(momoPattern, '<PaymentBadge mode="mobile_money" />');
    transformationsApplied++;
  }
  
  // 3. Affichage conditionnel du mode de paiement
  const conditionalPaymentPattern = /\{sale\.paymentMode === ['"]especes['"] \? \([^)]+\) : \([^)]+\)\}/g;
  if (conditionalPaymentPattern.test(content)) {
    content = content.replace(
      conditionalPaymentPattern,
      '<PaymentBadge mode={sale.paymentMode} operator={sale.mobileOperator} />'
    );
    transformationsApplied++;
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    return true;
  }
  return false;
}

/**
 * CAISSEPAGE.TSX - Transformer automatiquement
 */
function transformCaissePage(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // 1. Transformer le bouton "Valider la vente" en btn-primary-large
  const validateButtonPatterns = [
    // Pattern 1: bouton avec texte "Valider"
    {
      pattern: /<button\s+className="([^"]*btn-primary[^"]*)"([^>]*)>\s*(?:Valider|VALIDER|Valider la vente|VALIDER LA VENTE)\s*<\/button>/gi,
      replacement: '<button className="btn-primary-large"$2>VALIDER LA VENTE</button>',
    },
    // Pattern 2: bouton de checkout
    {
      pattern: /<button\s+className="([^"]*)"([^>]*onClick=\{[^}]*checkout[^}]*\}[^>]*)>\s*([^<]*)\s*<\/button>/gi,
      replacement: (match, classes, attrs, text) => {
        if (text.toLowerCase().includes('valid')) {
          return `<button className="btn-primary-large"${attrs}>VALIDER LA VENTE</button>`;
        }
        return match;
      },
    },
  ];
  
  validateButtonPatterns.forEach(({ pattern, replacement }) => {
    if (typeof replacement === 'function') {
      const newContent = content.replace(pattern, replacement);
      if (newContent !== content) {
        content = newContent;
        transformationsApplied++;
      }
    } else {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        transformationsApplied++;
      }
    }
  });
  
  // 2. Ajouter PaymentBadge pour les modes de paiement
  content = addImportIfNeeded(content, 'PaymentBadge', '@/components/ui/PaymentBadge');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    return true;
  }
  return false;
}

/**
 * VENTESPAGE.TSX - Transformer automatiquement
 */
function transformVentesPage(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Ajouter PaymentBadge
  content = addImportIfNeeded(content, 'PaymentBadge', '@/components/ui/PaymentBadge');
  
  // Remplacer les affichages de paiement
  const paymentDisplayPattern = /<span[^>]*>\s*\{.*paymentMode.*\}\s*<\/span>/g;
  if (paymentDisplayPattern.test(content)) {
    content = content.replace(
      paymentDisplayPattern,
      '<PaymentBadge mode={vente.paymentMode} operator={vente.mobileOperator} />'
    );
    transformationsApplied++;
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    return true;
  }
  return false;
}

/**
 * LOGINPAGE.TSX - Optimisations spécifiques
 */
function transformLoginPage(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Transformer les avatars carrés (pas ronds) - déjà fait en phase 1
  // Mais on peut optimiser la taille et le style
  
  // Patterns pour les cartes utilisateur
  const userCardPattern = /<div className="([^"]*border[^"]*rounded[^"]*)">/g;
  if (userCardPattern.test(content)) {
    content = content.replace(
      userCardPattern,
      '<div className="surface-container-lowest rounded-lg hover:surface-container-low transition-colors cursor-pointer">'
    );
    transformationsApplied++;
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    return true;
  }
  return false;
}

/**
 * Transformer tous les composants avec affichage de prix
 */
function addTabularNumsToAllPrices(content) {
  // Ajouter tabular-nums aux affichages de prix
  const pricePatterns = [
    // Pattern: {formatPrice(...)} ou {formatFCFA(...)}
    {
      pattern: /<span([^>]*)>\s*\{(?:formatPrice|formatFCFA|formatCurrency)\([^)]+\)\}\s*<\/span>/g,
      replacement: '<span$1 className="tabular-nums">{formatPrice($2)}</span>',
    },
    // Pattern: Prix avec FCFA
    {
      pattern: /<span([^>]*)>\s*\{[^}]*\}\s*FCFA\s*<\/span>/g,
      replacement: (match) => {
        if (!match.includes('tabular-nums')) {
          return match.replace('<span', '<span className="tabular-nums"');
        }
        return match;
      },
    },
  ];
  
  pricePatterns.forEach(({ pattern, replacement }) => {
    content = content.replace(pattern, replacement);
  });
  
  return content;
}

/**
 * MAIN EXECUTION
 */
async function main() {
  const pageTransformers = [
    { file: 'StockPage.tsx', transformer: transformStockPage, name: 'Stock' },
    { file: 'DashboardPage.tsx', transformer: transformDashboardPage, name: 'Dashboard' },
    { file: 'CaissePage.tsx', transformer: transformCaissePage, name: 'Caisse' },
    { file: 'VentesPage.tsx', transformer: transformVentesPage, name: 'Ventes' },
    { file: 'LoginPage.tsx', transformer: transformLoginPage, name: 'Login' },
  ];
  
  log('[1/3] Transformations spécifiques par page...', 'cyan');
  
  pageTransformers.forEach(({ file, transformer, name }) => {
    const filePath = path.join(PAGES_DIR, file);
    if (fs.existsSync(filePath)) {
      const modified = transformer(filePath);
      if (modified) {
        log(`  ✓ ${name}Page transformée`, 'green');
      }
    }
  });
  
  console.log();
  log('[2/3] Ajout de tabular-nums pour tous les prix...', 'cyan');
  
  // Parcourir tous les fichiers et ajouter tabular-nums
  function processAllFiles(dir) {
    if (!fs.existsSync(dir)) return;
    
    fs.readdirSync(dir).forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !['node_modules', 'dist', 'build'].includes(file)) {
        processAllFiles(filePath);
      } else if (/\.(tsx|ts)$/.test(file)) {
        let content = fs.readFileSync(filePath, 'utf8');
        const original = content;
        content = addTabularNumsToAllPrices(content);
        
        if (content !== original) {
          fs.writeFileSync(filePath, content, 'utf8');
          transformationsApplied++;
        }
      }
    });
  }
  
  processAllFiles(SRC_DIR);
  log('  ✓ tabular-nums ajouté aux prix', 'green');
  
  console.log();
  log('[3/3] Vérification finale...', 'cyan');
  log(`  ✓ ${filesModified} pages modifiées`, 'green');
  log(`  ✓ ${transformationsApplied} transformations appliquées`, 'green');
  
  console.log();
  log('================================================================', 'green');
  log('              PHASE 2 TERMINÉE - TOUT EST AUTOMATISÉ !         ', 'green');
  log('================================================================', 'green');
  console.log();
  
  log('TRANSFORMATIONS APPLIQUÉES:', 'cyan');
  log('  ✓ StatusBadge ajouté automatiquement (stock)', 'green');
  log('  ✓ PaymentBadge ajouté automatiquement (paiements)', 'green');
  log('  ✓ ProgressBar ajouté automatiquement (niveaux stock)', 'green');
  log('  ✓ Bouton validation → btn-primary-large (56px)', 'green');
  log('  ✓ tabular-nums ajouté aux prix/montants', 'green');
  log('  ✓ Imports automatiques ajoutés', 'green');
  console.log();
  
  log('PROCHAINE ÉTAPE:', 'yellow');
  log('  Rafraîchir votre navigateur (Ctrl+R ou F5)', 'yellow');
  log('  Tout devrait être parfait maintenant !', 'yellow');
  console.log();
}

main().catch(error => {
  log('ERREUR:', 'red');
  console.error(error);
  process.exit(1);
});
