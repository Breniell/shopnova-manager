/**
 * Import de produits depuis un fichier CSV (donc depuis Excel).
 *
 * Le gérant choisit un fichier, voit ce qui va se passer avant que quoi que ce
 * soit ne soit écrit, puis valide. Rien n'est créé tant que l'aperçu n'a pas
 * été confirmé : une saisie de catalogue est trop longue à refaire pour se
 * permettre une surprise.
 */
import React, { useRef, useState } from 'react';
import {
  useProductStore, composeVariantName, type Product,
} from '@/stores/useProductStore';
import { useSettingsStore, shopCategories } from '@/stores/useSettingsStore';
import { previewCsvFile, type ImportPreview, type ImportedProduct } from '@/lib/csvImport';
import { downloadTemplate } from '@/lib/csvTemplate';
import { generateInternalBarcode } from '@/lib/utils';
import { useTranslation } from '@/i18n';
import { X, Upload, FileDown, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProductImportModalProps {
  open: boolean;
  onClose: () => void;
}

/** Ce qu'on fait d'un produit déjà présent en boutique. */
type ExistingMode = 'skip' | 'update';

export const ProductImportModal: React.FC<ProductImportModalProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { products, addProduct, updateProduct } = useProductStore();
  const { shop, updateShop } = useSettingsStore();
  const categories = shopCategories(shop);

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [existingMode, setExistingMode] = useState<ExistingMode>('skip');
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setPreview(null);
    setFileName('');
    setExistingMode('skip');
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsReading(true);
    try {
      const result = await previewCsvFile(file, {
        existingProducts: products,
        existingCategories: categories,
      });
      setPreview(result);
      setFileName(file.name);
    } catch {
      toast.error(t('produits.importReadError'));
    } finally {
      setIsReading(false);
    }
  };

  const fresh = preview?.products.filter(p => !p.existing) ?? [];
  const already = preview?.products.filter(p => p.existing) ?? [];
  const willImport = fresh.length + (existingMode === 'update' ? already.length : 0);

  /** Crée un produit ordinaire, ou un parent et ses déclinaisons. */
  const createProduct = (product: ImportedProduct) => {
    const categorie = product.categorie || categories[0] || 'Autre';
    if (product.axes.length === 0) {
      const only = product.variants[0];
      addProduct({
        nom: product.nom, categorie, description: product.description,
        codeBarre: only.codeBarre || generateInternalBarcode(),
        prixAchat: only.prixAchat, prixVente: only.prixVente,
        stock: only.stock, seuilAlerte: only.seuilAlerte,
      });
      return;
    }

    // Un parent ne porte ni prix, ni stock, ni code-barres - sans quoi un scan
    // pourrait le faire tomber dans le panier alors qu'il est invendable.
    const parent = addProduct({
      nom: product.nom, categorie, description: product.description,
      codeBarre: '', prixAchat: 0, prixVente: 0, stock: 0, seuilAlerte: 0,
      variantAxes: product.axes,
    });
    for (const variant of product.variants) {
      addProduct({
        nom: composeVariantName(product.nom, product.axes, variant.values),
        categorie, description: product.description,
        codeBarre: variant.codeBarre || generateInternalBarcode(),
        prixAchat: variant.prixAchat, prixVente: variant.prixVente,
        stock: variant.stock, seuilAlerte: variant.seuilAlerte,
        parentId: parent.id, variantValues: variant.values,
      });
    }
  };

  /**
   * Met à jour un produit existant : prix, seuil, catégorie. Jamais le stock -
   * il ne se modifie que par une entrée de stock ou un inventaire, avec sa
   * trace au registre.
   */
  const refreshProduct = (existing: Product, product: ImportedProduct) => {
    const source = product.variants[0];
    updateProduct(existing.id, {
      prixAchat: source.prixAchat,
      prixVente: source.prixVente,
      seuilAlerte: source.seuilAlerte,
      ...(product.categorie ? { categorie: product.categorie } : {}),
    });
  };

  const handleImport = () => {
    if (!preview) return;
    setIsImporting(true);
    try {
      if (preview.newCategories.length > 0) {
        updateShop({ categories: [...categories, ...preview.newCategories] });
      }
      for (const product of fresh) createProduct(product);
      if (existingMode === 'update') {
        for (const product of already) refreshProduct(product.existing!, product);
      }
      toast.success(t('produits.importDone').replace('{n}', String(willImport)));
      reset();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('produits.importReadError'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="nova-card w-full max-w-[560px] max-h-[90vh] overflow-y-auto p-5 lg:p-6 animate-scale-in"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="nova-heading text-lg text-foreground">{t('produits.importTitle')}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {!preview ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('produits.importIntro')}</p>

            <div className="p-3 rounded-lg bg-muted/40 space-y-1.5">
              <p className="text-xs font-medium text-foreground">{t('produits.importColumnsTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('produits.importColumnsDesc')}</p>
              <p className="text-xs text-muted-foreground">{t('produits.importVariantsDesc')}</p>
            </div>

            <button
              type="button"
              onClick={downloadTemplate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground transition-colors text-sm"
            >
              <FileDown className="w-4 h-4" /> {t('produits.importTemplate')}
            </button>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isReading}
              className="w-full nova-btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isReading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t('produits.importChoose')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{fileName}</p>

            <div className="p-3 rounded-lg bg-muted/40 space-y-1 text-sm">
              <p className="text-foreground">
                <span className="font-semibold">{fresh.length}</span> {t('produits.importNew')}
              </p>
              {already.length > 0 && (
                <p className="text-foreground">
                  <span className="font-semibold">{already.length}</span> {t('produits.importExisting')}
                </p>
              )}
              {preview.axes.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('produits.importAxes').replace('{axes}', preview.axes.join(', '))}
                </p>
              )}
              {preview.newCategories.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('produits.importCategories').replace('{list}', preview.newCategories.join(', '))}
                </p>
              )}
            </div>

            {preview.issues.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1">
                <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {t('produits.importIssues').replace('{n}', String(preview.issues.length))}
                </p>
                <ul className="text-xs text-destructive/90 space-y-0.5 max-h-28 overflow-y-auto">
                  {preview.issues.slice(0, 20).map((issue, index) => (
                    <li key={index}>
                      {t('produits.importLine').replace('{n}', String(issue.line))} — {t(`produits.importErr_${issue.message}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {already.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('produits.importExistingQuestion')}</p>
                {([
                  ['skip', t('produits.importSkip')],
                  ['update', t('produits.importUpdate')],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                    <input
                      type="radio"
                      checked={existingMode === value}
                      onChange={() => setExistingMode(value)}
                      className="w-4 h-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
                <p className="text-[11px] text-muted-foreground">{t('produits.importStockNote')}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={reset}
                className="px-4 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
              >
                {t('produits.importBack')}
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || willImport === 0}
                className="flex-1 nova-btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />}
                {t('produits.importConfirm').replace('{n}', String(willImport))}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
