/**
 * Modèle CSV d'import de produits.
 *
 * Passe par `exportCSV`, donc par le même point-virgule et le même BOM UTF-8
 * que tous les autres exports : le fichier téléchargé se rouvre correctement
 * dans Excel, accents compris, et se réimporte tel quel.
 */
import { exportCSV } from '@/lib/export';
import {
  TEMPLATE_HEADERS, TEMPLATE_AXES, TEMPLATE_ROWS, TEMPLATE_AXIS_VALUES,
} from '@/lib/csvImport';

/** En-têtes du modèle : colonnes connues, puis deux exemples de critères. */
export function templateHeaders(): string[] {
  return [...TEMPLATE_HEADERS, ...TEMPLATE_AXES];
}

/** Lignes d'exemple : un produit simple, puis un produit à trois déclinaisons. */
export function templateRows(): string[][] {
  return TEMPLATE_ROWS.map((row, index) => [...row, ...TEMPLATE_AXIS_VALUES[index]]);
}

export function downloadTemplate(): void {
  exportCSV('modele-import-produits-legwan', templateHeaders(), templateRows());
}
