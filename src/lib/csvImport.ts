/**
 * Import de produits depuis un fichier CSV (donc depuis Excel).
 *
 * Pourquoi CSV et pas .xlsx : lire nativement un classeur Excel demanderait
 * SheetJS, environ 1 Mo de dépendance avec un historique de failles, pour un
 * gain nul - tout Excel sait faire « Enregistrer sous > CSV ». Le format
 * produit ici est celui qu'`exportCSV` produit déjà (point-virgule, BOM UTF-8).
 *
 * Trois pièges sont propres au marché visé, et ce module existe surtout pour
 * eux :
 *
 *   • **Le séparateur.** Excel en configuration française écrit `;`, parce que
 *     la virgule est le séparateur décimal. Un lecteur qui n'attendrait que la
 *     virgule échouerait sur tous les fichiers produits au Cameroun.
 *   • **L'encodage.** « CSV (séparateur : point-virgule) » enregistre en ANSI
 *     (windows-1252), pas en UTF-8 : « Café » et « Hygiène » ressortiraient
 *     illisibles. On détecte et on retombe sur windows-1252.
 *   • **Les nombres.** « 1 500,00 » doit valoir 1500, espace insécable
 *     comprise.
 */
import type { Product } from '@/stores/useProductStore';

export interface ImportedVariant {
  values: Record<string, string>;
  prixAchat: number;
  prixVente: number;
  stock: number;
  seuilAlerte: number;
  codeBarre: string;
}

/** Un produit prêt à créer : ordinaire, ou parent avec ses déclinaisons. */
export interface ImportedProduct {
  nom: string;
  categorie: string;
  description: string;
  /** Vide pour un produit ordinaire. */
  axes: string[];
  /** Une seule entrée pour un produit ordinaire. */
  variants: ImportedVariant[];
  /** Ligne du fichier, pour pouvoir situer une erreur. */
  line: number;
  /** Produit existant reconnu (par code-barres, sinon par nom). */
  existing?: Product;
}

export interface ImportIssue {
  line: number;
  message: string;
}

export interface ImportPreview {
  products: ImportedProduct[];
  issues: ImportIssue[];
  axes: string[];
  /** Catégories du fichier absentes de la boutique, à créer à la validation. */
  newCategories: string[];
  separator: string;
  encoding: 'utf-8' | 'windows-1252';
  totalRows: number;
}

// ─── Lecture du fichier ──────────────────────────────────────────────────────

/**
 * Décode le fichier en texte.
 *
 * Excel sous Windows enregistre en ANSI dès qu'on choisit « CSV (séparateur :
 * point-virgule) ». On tente donc UTF-8 en mode strict : un octet accentué
 * ANSI y est invalide, l'exception nous dit sans ambiguïté qu'il faut
 * windows-1252.
 */
export function decodeCsvBytes(bytes: ArrayBuffer): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  const view = new Uint8Array(bytes);
  const hasBom = view[0] === 0xEF && view[1] === 0xBB && view[2] === 0xBF;
  const body = hasBom ? view.subarray(3) : view;

  if (!hasBom) {
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
    } catch {
      return { text: new TextDecoder('windows-1252').decode(body), encoding: 'windows-1252' };
    }
  }
  return { text: new TextDecoder('utf-8').decode(body), encoding: 'utf-8' };
}

/** Sépérateur le plus probable, d'après la première ligne. */
export function detectSeparator(firstLine: string): string {
  const counts = [';', ',', '\t'].map(sep => ({
    sep,
    // Ne compter que hors guillemets : « Savon; grand format » ne doit pas
    // faire croire à un séparateur virgule.
    n: countOutsideQuotes(firstLine, sep),
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].sep : ';';
}

function countOutsideQuotes(line: string, sep: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (!inQuotes && line.startsWith(sep, i)) count++;
  }
  return count;
}

/**
 * Découpe un CSV en lignes de cellules, guillemets et retours à la ligne
 * échappés compris. Écrit à la main plutôt qu'avec une bibliothèque : le
 * besoin tient en trente lignes et une dépendance de plus se met à jour, se
 * casse et s'audite.
 */
export function parseCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += char;
      continue;
    }

    if (char === '"') { inQuotes = true; continue; }
    if (text.startsWith(separator, i)) { row.push(cell); cell = ''; i += separator.length - 1; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += char;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }

  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// ─── Interprétation des valeurs ──────────────────────────────────────────────

/** Compare des libellés sans tenir compte de la casse ni des accents. */
function normalise(value: string): string {
  return value.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * « 1 500,00 » vaut 1500. L'espace insécable et l'espace fine insécable sont
 * celles qu'Excel insère lui-même dans les milliers.
 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  // Le FCFA ne s'écrit pas en centimes ; on arrondit plutôt que de refuser.
  return Math.round(value);
}

/** Libellés acceptés pour chaque colonne connue, français et anglais. */
const COLUMN_ALIASES: Record<string, string[]> = {
  nom:          ['nom', 'nom du produit', 'produit', 'designation', 'libelle', 'name', 'product'],
  categorie:    ['categorie', 'category', 'rayon'],
  prixAchat:    ['prix achat', 'prix d achat', 'achat', 'cout', 'purchase price', 'cost'],
  prixVente:    ['prix vente', 'prix de vente', 'vente', 'prix', 'sale price', 'price'],
  stock:        ['stock', 'quantite', 'qte', 'quantity', 'qty'],
  seuilAlerte:  ['seuil', 'seuil alerte', 'seuil d alerte', 'alerte', 'threshold', 'min'],
  codeBarre:    ['code barres', 'code barre', 'codebarre', 'code-barres', 'ean', 'barcode', 'code'],
  description:  ['description', 'note', 'notes'],
};

export interface ColumnMap {
  known: Partial<Record<keyof typeof COLUMN_ALIASES, number>>;
  /** Index → nom de l'axe, pour toute colonne non reconnue. */
  axes: Array<{ index: number; axis: string }>;
}

export function mapColumns(header: string[]): ColumnMap {
  const known: ColumnMap['known'] = {};
  const axes: ColumnMap['axes'] = [];

  header.forEach((raw, index) => {
    const label = normalise(raw);
    if (label === '') return;
    const match = Object.entries(COLUMN_ALIASES)
      .find(([, aliases]) => aliases.includes(label));
    if (match && known[match[0] as keyof typeof COLUMN_ALIASES] === undefined) {
      known[match[0] as keyof typeof COLUMN_ALIASES] = index;
    } else if (!match) {
      // Toute colonne inconnue devient un critère de déclinaison : c'est ce
      // qui permet d'importer 60 perruques depuis un tableur, une ligne par
      // combinaison.
      axes.push({ index, axis: raw.trim() });
    }
  });

  return { known, axes };
}

// ─── Lecture complète ────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Produits déjà en boutique, pour reconnaître les doublons. */
  existingProducts: Product[];
  /** Catégories de la boutique, pour repérer celles à créer. */
  existingCategories: string[];
}

export function buildPreview(
  text: string,
  separator: string,
  encoding: 'utf-8' | 'windows-1252',
  options: ParseOptions,
): ImportPreview {
  const rows = parseCsv(text, separator);
  const issues: ImportIssue[] = [];

  if (rows.length < 2) {
    return {
      products: [], issues: [{ line: 1, message: 'empty' }], axes: [],
      newCategories: [], separator, encoding, totalRows: 0,
    };
  }

  const columns = mapColumns(rows[0]);
  if (columns.known.nom === undefined || columns.known.prixVente === undefined) {
    return {
      products: [], issues: [{ line: 1, message: 'missingColumns' }], axes: [],
      newCategories: [], separator, encoding, totalRows: rows.length - 1,
    };
  }

  const cell = (row: string[], index?: number) =>
    index === undefined ? '' : (row[index] ?? '').trim();

  const byName = new Map<string, ImportedProduct>();
  const seenBarcodes = new Set<string>();
  const declaredAxes = new Set<string>();

  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2; // +1 pour l'en-tête, +1 pour compter à partir de 1
    const nom = cell(row, columns.known.nom);
    if (!nom) { issues.push({ line, message: 'missingName' }); return; }

    const prixVente = parseAmount(cell(row, columns.known.prixVente));
    if (prixVente === null || prixVente <= 0) { issues.push({ line, message: 'missingSalePrice' }); return; }

    const prixAchatRaw = parseAmount(cell(row, columns.known.prixAchat));
    const prixAchat = prixAchatRaw === null ? 0 : prixAchatRaw;
    if (prixAchat > prixVente) issues.push({ line, message: 'costAboveSale' });

    const codeBarre = cell(row, columns.known.codeBarre);
    if (codeBarre) {
      if (seenBarcodes.has(codeBarre)) { issues.push({ line, message: 'duplicateBarcode' }); return; }
      seenBarcodes.add(codeBarre);
    }

    const values: Record<string, string> = {};
    for (const { index, axis } of columns.axes) {
      const value = cell(row, index);
      if (value) { values[axis] = value; declaredAxes.add(axis); }
    }

    const variant: ImportedVariant = {
      values,
      prixAchat,
      prixVente,
      stock: parseAmount(cell(row, columns.known.stock)) ?? 0,
      seuilAlerte: parseAmount(cell(row, columns.known.seuilAlerte)) ?? 5,
      codeBarre,
    };

    // Les lignes qui portent le même nom forment un seul produit : c'est la
    // façon naturelle d'écrire des déclinaisons dans un tableur.
    const key = normalise(nom);
    const found = byName.get(key);
    if (found) {
      const signature = JSON.stringify(values);
      if (found.variants.some(v => JSON.stringify(v.values) === signature)) {
        issues.push({ line, message: 'duplicateVariant' });
        return;
      }
      found.variants.push(variant);
      return;
    }

    byName.set(key, {
      nom,
      categorie: cell(row, columns.known.categorie) || '',
      description: cell(row, columns.known.description),
      axes: [],
      variants: [variant],
      line,
    });
  });

  // Un produit n'est un parent que si au moins une de ses lignes porte une
  // valeur de critère. Sinon c'est un produit ordinaire, même en plusieurs
  // exemplaires - et ces doublons-là sont une erreur.
  const axes = [...declaredAxes];
  const products = [...byName.values()].map(product => {
    const usesAxes = product.variants.some(v => Object.keys(v.values).length > 0);
    if (!usesAxes) {
      if (product.variants.length > 1) {
        issues.push({ line: product.line, message: 'duplicateName' });
        product.variants = product.variants.slice(0, 1);
      }
      return { ...product, axes: [] };
    }
    const used = axes.filter(axis => product.variants.some(v => v.values[axis]));
    return { ...product, axes: used };
  });

  // Reconnaissance des produits existants : par code-barres d'abord, qui est
  // sans ambiguïté, puis par nom.
  const barcodeIndex = new Map(
    options.existingProducts.filter(p => p.codeBarre).map(p => [p.codeBarre, p]),
  );
  const nameIndex = new Map(options.existingProducts.map(p => [normalise(p.nom), p]));
  for (const product of products) {
    const viaBarcode = product.variants
      .map(v => v.codeBarre && barcodeIndex.get(v.codeBarre))
      .find(Boolean);
    product.existing = (viaBarcode || nameIndex.get(normalise(product.nom))) || undefined;
  }

  const knownCategories = new Set(options.existingCategories.map(normalise));
  const newCategories = [...new Set(
    products.map(p => p.categorie).filter(c => c && !knownCategories.has(normalise(c))),
  )];

  return {
    products, issues, axes, newCategories, separator, encoding,
    totalRows: rows.length - 1,
  };
}

/** Lit un fichier choisi par le gérant et en construit l'aperçu. */
export async function previewCsvFile(file: File, options: ParseOptions): Promise<ImportPreview> {
  const { text, encoding } = decodeCsvBytes(await file.arrayBuffer());
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return buildPreview(text, detectSeparator(firstLine), encoding, options);
}

/** En-têtes du modèle envoyé aux commerçants. */
export const TEMPLATE_HEADERS = [
  'Nom', 'Categorie', 'Prix achat', 'Prix vente', 'Stock', 'Seuil', 'Code-barres', 'Description',
];

/** Deux exemples : un produit ordinaire, et un produit décliné sur deux critères. */
export const TEMPLATE_ROWS: string[][] = [
  ['Savon de Marseille', 'Hygiene', '800', '1200', '40', '10', '', 'Exemple de produit simple'],
  ['Perruque Bob', 'Beaute', '8000', '15000', '4', '2', '', 'Exemple avec declinaisons'],
  ['Perruque Bob', 'Beaute', '8000', '15000', '2', '2', '', ''],
  ['Perruque Bob', 'Beaute', '11000', '20000', '3', '2', '', ''],
];

/** Colonnes de critères ajoutées au modèle, après les colonnes connues. */
export const TEMPLATE_AXES = ['Longueur', 'Couleur'];
export const TEMPLATE_AXIS_VALUES: string[][] = [
  ['', ''],
  ['12 pouces', 'Noir'],
  ['12 pouces', 'Brun'],
  ['16 pouces', 'Noir'],
];
