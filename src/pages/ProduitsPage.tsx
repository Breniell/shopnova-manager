import React, { useState } from 'react';
import {
  useProductStore, Product, Category,
  isParent, composeVariantName, VARIANT_AXIS_SUGGESTIONS,
} from '@/stores/useProductStore';
import { useSettingsStore, shopCategories } from '@/stores/useSettingsStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useTranslation } from '@/i18n';
import { formatFCFA } from '@/utils/formatters';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { LabelPrint } from '@/components/ui/LabelPrint';
import { ProductImportModal } from '@/components/ui/ProductImportModal';
import { getStockStatus, generateInternalBarcode, isValidEAN13, cn } from '@/lib/utils';
import { productImages } from '@/assets/productImages';
import { compressImageToDataUrl } from '@/lib/imageUtils';
import {
  Search, Plus, Edit, Trash2, Package, X, Camera, Hash, Tag, Upload, Loader2,
  Image as ImageIcon, ChevronRight, ChevronDown, Layers,
} from 'lucide-react';
import { toast } from 'sonner';

/** Une ligne du tableau de déclinaisons pendant la saisie. */
interface VariantDraft {
  /** Clé locale de la ligne ; l'id Firestore arrive dans `id` à l'édition. */
  key: string;
  id?: string;
  values: Record<string, string>;
  prixAchat: string;
  prixVente: string;
  stock: string;
  seuilAlerte: string;
  codeBarre: string;
}

const newVariantDraft = (): VariantDraft => ({
  key: `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  values: {}, prixAchat: '', prixVente: '', stock: '', seuilAlerte: '5', codeBarre: '',
});

const ProduitsPage: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct, getVariants } = useProductStore();
  const { shop, updateShop } = useSettingsStore();
  const categories = shopCategories(shop);
  const { cart } = useSaleStore();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [labelProduct, setLabelProduct] = useState<Product | null>(null);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const imageFileRef = React.useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  /** Nom de la catégorie en cours de création, ou null si la saisie est fermée. */
  const [newCategory, setNewCategory] = useState<string | null>(null);

  const handleAddCategory = () => {
    const name = (newCategory ?? '').trim();
    if (!name) return;
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) {
      toast.error(t('produits.categoryExists'));
      return;
    }
    updateShop({ categories: [...categories, name] });
    setForm(f => ({ ...f, categorie: name }));
    setNewCategory(null);
  };

  const emptyForm = {
    nom: '', categorie: categories[0] ?? 'Autre', codeBarre: '', prixAchat: '',
    prixVente: '', prixCible: '', prixPlancher: '', negociable: false,
    stock: '', seuilAlerte: '5', description: '', imageUrl: '',
    hasVariants: false, axes: [] as string[], variants: [] as VariantDraft[],
  };
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setNewCategory(null);
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setNewCategory(null);
    const axes = p.variantAxes ?? [];
    setForm({
      nom: p.nom, categorie: p.categorie, codeBarre: p.codeBarre,
      prixAchat: String(p.prixAchat), prixVente: String(p.prixVente),
      prixCible: p.prixCible !== undefined ? String(p.prixCible) : '',
      prixPlancher: p.prixPlancher !== undefined ? String(p.prixPlancher) : '',
      negociable: p.negociable === true,
      stock: String(p.stock), seuilAlerte: String(p.seuilAlerte), description: p.description || '',
      imageUrl: p.imageUrl || '',
      hasVariants: isParent(p),
      axes,
      variants: getVariants(p.id).map(variant => ({
        key: variant.id,
        id: variant.id,
        values: { ...(variant.variantValues ?? {}) },
        prixAchat: String(variant.prixAchat),
        prixVente: String(variant.prixVente),
        stock: String(variant.stock),
        seuilAlerte: String(variant.seuilAlerte),
        codeBarre: variant.codeBarre,
      })),
    });
    setShowModal(true);
  };

  const toggleExpanded = (id: string) => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsImageProcessing(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, { maxDimension: 640 });
      setForm(f => ({ ...f, imageUrl: dataUrl }));
    } catch {
      toast.error(t('produits.imageTooLarge'));
    } finally {
      setIsImageProcessing(false);
    }
  };

  const handleRemoveImage = () => setForm(f => ({ ...f, imageUrl: '' }));

  // Non-blocking EAN-13 validation (only when field is non-empty)
  const barcodeWarning = form.codeBarre.trim() && !isValidEAN13(form.codeBarre.trim())
    ? t('produits.barcodeInvalid')
    : null;

  // Duplicate check: same code on a different product
  const barcodeDuplicate = form.codeBarre.trim()
    ? products.find(p => p.codeBarre === form.codeBarre.trim() && p.id !== editingProduct?.id) ?? null
    : null;

  /**
   * Enregistre un produit à déclinaisons : le parent, puis une fiche par
   * déclinaison. Le parent ne porte ni prix ni stock - ce sont les
   * déclinaisons qui les portent - et pas de code-barres non plus, pour qu'un
   * scan ne puisse jamais faire tomber un parent invendable dans le panier.
   */
  const submitWithVariants = () => {
    const axes = form.axes.map(axis => axis.trim()).filter(Boolean);
    if (axes.length === 0) {
      toast.error(t('produits.axisRequired'));
      return;
    }
    if (form.variants.length === 0) {
      toast.error(t('produits.variantRequired'));
      return;
    }
    for (const variant of form.variants) {
      if (axes.some(axis => !variant.values[axis]?.trim())) {
        toast.error(t('produits.variantValuesRequired'));
        return;
      }
      if (!variant.prixAchat || !variant.prixVente) {
        toast.error(t('produits.variantPricesRequired'));
        return;
      }
    }
    // Deux déclinaisons identiques donneraient deux fiches au même nom, donc
    // deux stocks distincts pour un même article réel.
    const signatures = form.variants.map(v => axes.map(a => v.values[a].trim()).join(' / '));
    const duplicate = signatures.find((sig, index) => signatures.indexOf(sig) !== index);
    if (duplicate) {
      toast.error(t('produits.variantDuplicate').replace('{values}', duplicate));
      return;
    }

    const parentFields = {
      nom: form.nom, categorie: form.categorie, codeBarre: '',
      prixAchat: 0, prixVente: 0, stock: 0, seuilAlerte: 0,
      description: form.description, imageUrl: form.imageUrl,
      variantAxes: axes,
    };

    const parentId = editingProduct
      ? (updateProduct(editingProduct.id, parentFields), editingProduct.id)
      : addProduct(parentFields).id;

    const keptIds = new Set<string>();
    for (const variant of form.variants) {
      const values = Object.fromEntries(axes.map(axis => [axis, variant.values[axis].trim()]));
      const fields = {
        nom: composeVariantName(form.nom, axes, values),
        categorie: form.categorie,
        codeBarre: variant.codeBarre.trim() || generateInternalBarcode(),
        prixAchat: parseInt(variant.prixAchat, 10) || 0,
        prixVente: parseInt(variant.prixVente, 10) || 0,
        seuilAlerte: parseInt(variant.seuilAlerte, 10) || 5,
        description: form.description,
        imageUrl: form.imageUrl,
        parentId,
        variantValues: values,
      };
      if (variant.id) {
        updateProduct(variant.id, fields);
        keptIds.add(variant.id);
      } else {
        keptIds.add(addProduct({ ...fields, stock: parseInt(variant.stock, 10) || 0 }).id);
      }
    }

    // Les lignes retirées du tableau pendant l'édition doivent disparaître.
    if (editingProduct) {
      for (const existing of getVariants(editingProduct.id)) {
        if (!keptIds.has(existing.id)) deleteProduct(existing.id);
      }
    }

    toast.success(editingProduct ? t('produits.updated') : t('produits.added'));
    setShowModal(false);
  };

  const handleSubmit = () => {
    if (!form.nom) {
      toast.error(t('produits.requiredFields'));
      return;
    }
    if (form.hasVariants) {
      submitWithVariants();
      return;
    }
    if (!form.prixAchat || !form.prixVente) {
      toast.error(t('produits.requiredFields'));
      return;
    }
    if (barcodeDuplicate) {
      toast.error(t('produits.barcodeDuplicate').replace('{name}', barcodeDuplicate.nom));
      return;
    }

    const prixAchatNum = parseInt(form.prixAchat, 10) || 0;
    const prixVenteNum = parseInt(form.prixVente, 10) || 0;
    const prixCibleNum = form.prixCible ? parseInt(form.prixCible, 10) : undefined;
    const prixPlancherNum = form.prixPlancher ? parseInt(form.prixPlancher, 10) : undefined;

    if (form.negociable) {
      if (prixPlancherNum !== undefined && prixPlancherNum < prixAchatNum) {
        toast.error(t('produits.floorBelowCost'));
        return;
      }
      if (prixCibleNum !== undefined && prixPlancherNum !== undefined && prixCibleNum < prixPlancherNum) {
        toast.error(t('produits.targetBelowFloor'));
        return;
      }
      if (prixCibleNum !== undefined && prixCibleNum > prixVenteNum) {
        toast.error(t('produits.targetAboveSale'));
        return;
      }
    }

    // Auto-generate an internal code (prefix '2') only when left empty
    const codeBarre = form.codeBarre.trim() || generateInternalBarcode();

    // Décocher « déclinaisons » sur un produit qui en avait doit les emporter,
    // sinon elles resteraient vendables au scan tout en étant invisibles.
    if (editingProduct && isParent(editingProduct)) {
      for (const orphan of getVariants(editingProduct.id)) deleteProduct(orphan.id);
    }

    const data = {
      nom: form.nom, categorie: form.categorie, codeBarre,
      prixAchat: prixAchatNum, prixVente: prixVenteNum,
      variantAxes: undefined,
      prixCible: form.negociable ? prixCibleNum : undefined,
      prixPlancher: form.negociable ? prixPlancherNum : undefined,
      negociable: form.negociable,
      stock: editingProduct ? editingProduct.stock : (parseInt(form.stock, 10) || 0),
      seuilAlerte: parseInt(form.seuilAlerte, 10) || 5, description: form.description,
      imageUrl: form.imageUrl,
    };
    if (editingProduct) {
      updateProduct(editingProduct.id, data);
      toast.success(t('produits.updated'));
    } else {
      addProduct(data);
      toast.success(t('produits.added'));
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    // Supprimer un parent emporte ses déclinaisons : il faut donc vérifier le
    // panier pour chacune, pas seulement pour le parent.
    const doomedIds = [deleteTarget.id, ...getVariants(deleteTarget.id).map(v => v.id)];
    if (cart.some(item => doomedIds.includes(item.productId))) {
      toast.error(t('produits.inCartError'));
      setDeleteTarget(null);
      return;
    }
    deleteProduct(deleteTarget.id);
    toast.success(t('produits.deleted'));
    setDeleteTarget(null);
  };

  const marge = form.prixAchat && form.prixVente
    ? (((parseInt(form.prixVente, 10) || 0) - (parseInt(form.prixAchat, 10) || 0)) / (parseInt(form.prixAchat, 10) || 1) * 100)
    : 0;

  /**
   * Le tableau liste des lignes de premier niveau : produits ordinaires et
   * parents. Les déclinaisons s'affichent en retrait sous leur parent, sinon
   * on retrouverait la liste interminable que les déclinaisons corrigent.
   */
  const variantsOf = (parent: Product) => products.filter(p => p.parentId === parent.id);

  /**
   * Chiffres d'une ligne : ceux du produit lui-même, ou le cumul de ses
   * déclinaisons pour un parent, qui ne porte rien en propre.
   */
  const rowFigures = (p: Product) => {
    if (!isParent(p)) {
      return { stock: p.stock, seuilAlerte: p.seuilAlerte, prixMin: p.prixVente, prixMax: p.prixVente, count: 0 };
    }
    const children = variantsOf(p);
    const prices = children.map(c => c.prixVente);
    return {
      stock: children.reduce((sum, c) => sum + c.stock, 0),
      seuilAlerte: children.reduce((sum, c) => sum + c.seuilAlerte, 0),
      prixMin: prices.length ? Math.min(...prices) : 0,
      prixMax: prices.length ? Math.max(...prices) : 0,
      count: children.length,
    };
  };

  const needle = search.toLowerCase();
  // Chercher « Noir » doit trouver le parent dont une déclinaison est noire.
  const matchesSearch = (p: Product) =>
    p.nom.toLowerCase().includes(needle)
    || p.codeBarre.includes(search)
    || variantsOf(p).some(v => v.nom.toLowerCase().includes(needle) || v.codeBarre.includes(search));

  let filtered = products.filter(p => !p.parentId && matchesSearch(p));
  if (catFilter) filtered = filtered.filter(p => p.categorie === catFilter);
  if (stockFilter) {
    filtered = filtered.filter(p => {
      const { stock, seuilAlerte } = rowFigures(p);
      if (stockFilter === 'ok') return stock > seuilAlerte;
      if (stockFilter === 'low') return stock > 0 && stock <= seuilAlerte;
      return stock <= 0;
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl nova-heading text-foreground">{t('produits.title')}</h1>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" /> {t('produits.importBtn')}
          </button>
          <button onClick={openAdd} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5">
            <Plus className="w-4 h-4" /> {t('produits.addBtn')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="nova-input w-full pl-10" placeholder={t('produits.searchPlaceholder')} />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="nova-input min-w-[140px]">
          <option value="">{t('produits.allCategories')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} className="nova-input min-w-[130px]">
          <option value="">{t('produits.allStock')}</option>
          <option value="ok">{t('produits.stockOk')}</option>
          <option value="low">{t('produits.stockLow')}</option>
          <option value="out">{t('produits.stockOut')}</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title={t('produits.noProduct')}
          description={t('produits.noProductDesc')}
          action={<button onClick={openAdd} className="nova-btn-primary px-5 mt-4"><Plus className="w-4 h-4" />{t('produits.addBtn')}</button>}
        />
      ) : (
        <div className="nova-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="nova-table-header">
                  <th className="text-left p-3">{t('produits.colNum')}</th>
                  <th className="text-left p-3">{t('produits.colProduct')}</th>
                  <th className="text-left p-3 hidden md:table-cell">{t('produits.colBarcode')}</th>
                  <th className="text-right p-3 hidden sm:table-cell">{t('produits.colPurchasePrice')}</th>
                  <th className="text-right p-3">{t('produits.colSalePrice')}</th>
                  <th className="text-right p-3 hidden sm:table-cell">{t('produits.colMargin')}</th>
                  <th className="text-right p-3">{t('produits.colStock')}</th>
                  <th className="text-right p-3 hidden md:table-cell">{t('produits.colThreshold')}</th>
                  <th className="text-right p-3">{t('produits.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const figures = rowFigures(p);
                  const parent = isParent(p);
                  const status = getStockStatus(figures.stock, figures.seuilAlerte);
                  const margin = ((p.prixVente - p.prixAchat) / p.prixAchat * 100);
                  const isInternal = p.codeBarre.startsWith('2');
                  const open = expanded.has(p.id);
                  return (
                    <React.Fragment key={p.id}>
                    <tr className="border-t border-border hover:bg-muted/30 transition-colors group">
                      <td className="p-3 text-sm text-muted-foreground">{i + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 lg:gap-3">
                          {parent && (
                            <button
                              onClick={() => toggleExpanded(p.id)}
                              aria-label={t('produits.variantsToggle')}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                            >
                              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                          {p.imageUrl || productImages[p.id] ? (
                            <img src={p.imageUrl || productImages[p.id]} alt={p.nom} className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">{p.nom}</p>
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.categorie}</span>
                            {parent && (
                              <span className="ml-1 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                                <Layers className="w-2.5 h-2.5" />
                                {t('produits.variantsCount').replace('{n}', String(figures.count))}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td
                        className="p-3 text-sm font-mono text-muted-foreground cursor-pointer hover:text-foreground hidden md:table-cell"
                        onClick={() => {
                          if (!p.codeBarre) return;
                          navigator.clipboard.writeText(p.codeBarre);
                          toast.success(t('produits.copied'));
                        }}
                      >
                        <span className="flex items-center gap-1.5">
                          {p.codeBarre || '—'}
                          {isInternal && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-600 px-1 py-0.5 rounded font-sans">vrac</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 money text-right text-muted-foreground hidden sm:table-cell">
                        {parent ? '—' : formatFCFA(p.prixAchat)}
                      </td>
                      <td className="p-3 money text-right text-foreground">
                        {parent
                          ? (figures.prixMin === figures.prixMax
                              ? formatFCFA(figures.prixMin)
                              : `${formatFCFA(figures.prixMin)} – ${formatFCFA(figures.prixMax)}`)
                          : formatFCFA(p.prixVente)}
                      </td>
                      <td className={cn('p-3 text-sm text-right font-medium tabular-nums hidden sm:table-cell', margin >= 20 ? 'text-emerald-400' : margin >= 10 ? 'text-amber-400' : 'text-red-400')}>
                        {parent ? '—' : `${margin.toFixed(1)}%`}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <StatusBadge status={status} />
                          <span className="text-sm tabular-nums text-foreground">{figures.stock}</span>
                        </div>
                      </td>
                      <td className="p-3 money text-right text-muted-foreground hidden md:table-cell">
                        {parent ? '—' : p.seuilAlerte}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isInternal && (
                            <button
                              onClick={() => setLabelProduct(p)}
                              title={t('produits.labelPrintBtn')}
                              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <Tag className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-lg hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Déclinaisons, en retrait sous leur parent */}
                    {parent && open && variantsOf(p).map(variant => {
                      const variantStatus = getStockStatus(variant.stock, variant.seuilAlerte);
                      const variantMargin = ((variant.prixVente - variant.prixAchat) / variant.prixAchat * 100);
                      return (
                        <tr key={variant.id} className="border-t border-border/50 bg-muted/10 group/variant">
                          <td className="p-3" />
                          <td className="p-3 pl-10">
                            <p className="text-sm text-foreground">
                              {(p.variantAxes ?? []).map(axis => variant.variantValues?.[axis]).filter(Boolean).join(' / ')}
                            </p>
                            <span className="text-[10px] font-mono text-muted-foreground">{variant.codeBarre}</span>
                          </td>
                          <td className="p-3 hidden md:table-cell" />
                          <td className="p-3 money text-right text-muted-foreground hidden sm:table-cell">{formatFCFA(variant.prixAchat)}</td>
                          <td className="p-3 money text-right text-foreground">{formatFCFA(variant.prixVente)}</td>
                          <td className={cn('p-3 text-sm text-right font-medium tabular-nums hidden sm:table-cell', variantMargin >= 20 ? 'text-emerald-400' : variantMargin >= 10 ? 'text-amber-400' : 'text-red-400')}>
                            {variantMargin.toFixed(1)}%
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <StatusBadge status={variantStatus} />
                              <span className="text-sm tabular-nums text-foreground">{variant.stock}</span>
                            </div>
                          </td>
                          <td className="p-3 money text-right text-muted-foreground hidden md:table-cell">{variant.seuilAlerte}</td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover/variant:opacity-100 transition-opacity">
                              <button
                                onClick={() => setLabelProduct(variant)}
                                title={t('produits.labelPrintBtn')}
                                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              >
                                <Tag className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="nova-card w-full max-w-[520px] max-h-[90vh] overflow-y-auto p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">{editingProduct ? t('produits.editTitle') : t('produits.addTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelName')}</label>
                <input type="text" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelCategory')}</label>
                <select
                  value={form.categorie}
                  onChange={e => {
                    // Les catégories étaient figées dans le code : aucune ne
                    // convenait à la beauté, à la coiffure ou à la quincaillerie.
                    if (e.target.value === '__new__') {
                      // Surtout pas window.prompt() : Electron ne l'implémente
                      // pas et renvoie null sans rien afficher. Le choix restait
                      // donc sans effet dans l'application installée, alors
                      // qu'il fonctionnait en navigateur.
                      setNewCategory('');
                      return;
                    }
                    setForm({ ...form, categorie: e.target.value as Category });
                  }}
                  className="nova-input w-full"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__new__">{t('produits.categoryNew')}</option>
                </select>

                {newCategory !== null && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); }
                        if (e.key === 'Escape') setNewCategory(null);
                      }}
                      className="nova-input flex-1"
                      placeholder={t('produits.categoryNewPrompt')}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="nova-btn-primary px-4 shrink-0 text-sm"
                    >
                      {t('produits.categoryNewConfirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCategory(null)}
                      className="px-3 rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      aria-label={t('produits.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* ── Image du produit ────────────────────────────────────── */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelImage')}</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg border border-border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
                    {form.imageUrl ? (
                      <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => imageFileRef.current?.click()}
                        disabled={isImageProcessing}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground transition-colors text-xs disabled:opacity-60"
                      >
                        {isImageProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {t('produits.imageChoose')}
                      </button>
                      {form.imageUrl && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted hover:bg-destructive/20 hover:text-destructive text-foreground transition-colors text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('produits.imageRemove')}
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{t('produits.imageHint')}</p>
                  </div>
                  <input
                    ref={imageFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
              </div>

              {/* ── Déclinaisons ────────────────────────────────────────── */}
              <div className="border-t border-border pt-4">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasVariants}
                    onChange={e => setForm({
                      ...form,
                      hasVariants: e.target.checked,
                      // Amorcer avec un axe et une ligne : partir d'un tableau
                      // vide oblige le commerçant à deviner quoi faire.
                      axes: e.target.checked && form.axes.length === 0 ? [''] : form.axes,
                      variants: e.target.checked && form.variants.length === 0
                        ? [newVariantDraft()] : form.variants,
                    })}
                    className="w-4 h-4 rounded"
                  />
                  <Layers className="w-4 h-4 text-primary" />
                  {t('produits.variantsEnable')}
                </label>
                <p className="text-[11px] text-muted-foreground mt-1 ml-6">
                  {t('produits.variantsHint')}
                </p>

                {form.hasVariants && (
                  <div className="mt-4 space-y-4">
                    {/* Axes */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">{t('produits.axisLabel')}</label>
                      <div className="space-y-2">
                        {form.axes.map((axis, axisIndex) => (
                          <div key={axisIndex} className="flex gap-2">
                            <input
                              type="text"
                              value={axis}
                              onChange={e => setForm(f => {
                                const previousName = f.axes[axisIndex];
                                const axes = [...f.axes];
                                axes[axisIndex] = e.target.value;
                                // Renommer un axe doit déplacer les valeurs
                                // déjà saisies, sinon elles deviennent orphelines.
                                const variants = f.variants.map(v => {
                                  const values = { ...v.values };
                                  if (previousName in values) {
                                    values[e.target.value] = values[previousName];
                                    delete values[previousName];
                                  }
                                  return { ...v, values };
                                });
                                return { ...f, axes, variants };
                              })}
                              className="nova-input flex-1"
                              placeholder={t('produits.axisPlaceholder')}
                              list="axis-suggestions"
                            />
                            {form.axes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, axes: f.axes.filter((_, index) => index !== axisIndex) }))}
                                className="px-3 rounded-lg border border-border bg-muted hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors shrink-0"
                                aria-label={t('produits.axisRemove')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <datalist id="axis-suggestions">
                          {VARIANT_AXIS_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                        </datalist>
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, axes: [...f.axes, ''] }))}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> {t('produits.axisAdd')}
                        </button>
                      </div>
                    </div>

                    {/* Tableau des déclinaisons */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">{t('produits.variantsTitle')}</label>
                      <div className="space-y-2">
                        {form.variants.map((variant, variantIndex) => (
                          <div key={variant.key} className="p-2.5 rounded-lg bg-muted/40 space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                {form.axes.filter(Boolean).map(axis => (
                                  <input
                                    key={axis}
                                    type="text"
                                    value={variant.values[axis] ?? ''}
                                    onChange={e => setForm(f => ({
                                      ...f,
                                      variants: f.variants.map((v, index) => index === variantIndex
                                        ? { ...v, values: { ...v.values, [axis]: e.target.value } }
                                        : v),
                                    }))}
                                    className="nova-input py-1.5 text-sm"
                                    placeholder={axis}
                                  />
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, variants: f.variants.filter((_, index) => index !== variantIndex) }))}
                                className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                aria-label={t('produits.variantRemove')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="number" value={variant.prixAchat}
                                onChange={e => setForm(f => ({
                                  ...f,
                                  variants: f.variants.map((v, index) => index === variantIndex ? { ...v, prixAchat: e.target.value } : v),
                                }))}
                                className="nova-input py-1.5 text-sm" placeholder={t('produits.colPurchasePrice')}
                              />
                              <input
                                type="number" value={variant.prixVente}
                                onChange={e => setForm(f => ({
                                  ...f,
                                  variants: f.variants.map((v, index) => index === variantIndex ? { ...v, prixVente: e.target.value } : v),
                                }))}
                                className="nova-input py-1.5 text-sm" placeholder={t('produits.colSalePrice')}
                              />
                              {variant.id ? (
                                // Le stock d'une déclinaison existante ne se
                                // modifie que par une entrée de stock, comme
                                // pour tout autre produit.
                                <div className="nova-input py-1.5 text-sm text-muted-foreground flex items-center">
                                  {t('produits.colStock')} : {variant.stock}
                                </div>
                              ) : (
                                <input
                                  type="number" value={variant.stock}
                                  onChange={e => setForm(f => ({
                                    ...f,
                                    variants: f.variants.map((v, index) => index === variantIndex ? { ...v, stock: e.target.value } : v),
                                  }))}
                                  className="nova-input py-1.5 text-sm" placeholder={t('produits.colStock')}
                                />
                              )}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, variants: [...f.variants, newVariantDraft()] }))}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> {t('produits.variantAdd')}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">{t('produits.variantBarcodeHint')}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Code-barres ─────────────────────────────────────────── */}
              <div className={cn(form.hasVariants && 'hidden')}>
                <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelBarcode')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.codeBarre}
                    onChange={e => setForm({ ...form, codeBarre: e.target.value })}
                    className={cn('nova-input flex-1', barcodeWarning && 'border-amber-500/60')}
                    placeholder="EAN-13"
                    maxLength={13}
                  />
                  {/* Camera scan - for packaged products with a manufacturer barcode */}
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    title={t('produits.scanBtn')}
                    className="px-3 rounded-lg border border-border bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  {/* Generate internal code - for bulk/loose products without a factory barcode */}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, codeBarre: generateInternalBarcode() })}
                    title={t('produits.generateVracHint')}
                    className="px-2 rounded-lg border border-border bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center gap-1 text-xs whitespace-nowrap"
                  >
                    <Hash className="w-3.5 h-3.5" />
                    {t('produits.generateVrac')}
                  </button>
                </div>
                {barcodeWarning && !barcodeDuplicate && (
                  <p className="text-[11px] text-amber-500 mt-1">{barcodeWarning}</p>
                )}
                {barcodeDuplicate && (
                  <p className="text-[11px] text-destructive mt-1">
                    {t('produits.barcodeDuplicate').replace('{name}', barcodeDuplicate.nom)}
                  </p>
                )}
                {!form.codeBarre.trim() && (
                  <p className="text-[11px] text-muted-foreground mt-1">{t('produits.barcodeAutoGenerate')}</p>
                )}
              </div>

              {/* Prix, négociation et stock appartiennent à chaque déclinaison
                  dès qu'il y en a : le parent n'en porte aucun. */}
              <div className={cn('grid grid-cols-2 gap-4', form.hasVariants && 'hidden')}>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelPurchasePrice')}</label>
                  <input type="number" value={form.prixAchat} onChange={e => setForm({ ...form, prixAchat: e.target.value })} className="nova-input w-full" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelSalePrice')}</label>
                  <input type="number" value={form.prixVente} onChange={e => setForm({ ...form, prixVente: e.target.value })} className="nova-input w-full" />
                </div>
              </div>
              {form.prixAchat && form.prixVente && !form.hasVariants && (
                <div className={cn('text-sm font-medium', marge >= 20 ? 'text-emerald-400' : marge >= 10 ? 'text-amber-400' : 'text-red-400')}>
                  {t('produits.colMargin')}: {formatFCFA((parseInt(form.prixVente, 10) || 0) - (parseInt(form.prixAchat, 10) || 0))} ({marge.toFixed(1)}%)
                </div>
              )}

              {/* ── Négociation ─────────────────────────────────────────── */}
              <div className={cn('border-t border-border pt-4', form.hasVariants && 'hidden')}>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.negociable}
                    onChange={e => setForm({ ...form, negociable: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  {t('produits.negotiableLabel')}
                </label>
                <p className="text-[11px] text-muted-foreground mt-1 ml-6">
                  {t('produits.negotiableHint')}
                </p>

                {form.negociable && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelFloorPrice')}</label>
                      <input
                        type="number" min="0"
                        value={form.prixPlancher}
                        onChange={e => setForm({ ...form, prixPlancher: e.target.value })}
                        className="nova-input w-full"
                        placeholder={form.prixAchat || '0'}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {t('produits.floorPriceHint')}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelTargetPrice')}</label>
                      <input
                        type="number" min="0"
                        value={form.prixCible}
                        onChange={e => setForm({ ...form, prixCible: e.target.value })}
                        className="nova-input w-full"
                        placeholder={form.prixVente || '0'}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {t('produits.targetPriceHint')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {!editingProduct && !form.hasVariants && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelInitialStock')}</label>
                  <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="nova-input w-full" />
                </div>
              )}
              <div className={cn(form.hasVariants && 'hidden')}>
                <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelThreshold')}</label>
                <input type="number" value={form.seuilAlerte} onChange={e => setForm({ ...form, seuilAlerte: e.target.value })} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelDescription')}</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="nova-input w-full h-20 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('produits.cancel')}</button>
              <button onClick={handleSubmit} className="flex-1 nova-btn-primary py-2.5">{editingProduct ? t('produits.save') : t('produits.add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="nova-card p-5 lg:p-6 w-full max-w-[400px] animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="nova-heading text-lg text-foreground mb-2">{t('produits.deleteTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {t('produits.deleteDesc').replace('{name}', deleteTarget.nom)}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('produits.cancel')}</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">{t('produits.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Camera barcode scanner - for reading manufacturer codes on packaged products */}
      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={code => { setForm(f => ({ ...f, codeBarre: code })); }}
      />

      {/* Label print - only shown for internal (prefix '2') products */}
      <LabelPrint
        product={labelProduct}
        onClose={() => setLabelProduct(null)}
      />

      {/* Import depuis un tableur */}
      <ProductImportModal open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
};

export default ProduitsPage;
