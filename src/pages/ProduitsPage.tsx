import React, { useState } from 'react';
import { useProductStore, Product, Category } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useTranslation } from '@/i18n';
import { formatFCFA } from '@/utils/formatters';

import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarcodeScanner } from '@/components/ui/BarcodeScanner';
import { LabelPrint } from '@/components/ui/LabelPrint';
import { getStockStatus, generateInternalBarcode, isValidEAN13, cn } from '@/lib/utils';
import { productImages } from '@/assets/productImages';
import { Search, Plus, Edit, Trash2, Package, X, Camera, Hash, Tag } from 'lucide-react';
import { toast } from 'sonner';

const ProduitsPage: React.FC = () => {
  const { products, categories, addProduct, updateProduct, deleteProduct } = useProductStore();
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

  const [form, setForm] = useState({
    nom: '', categorie: 'Alimentation' as Category, codeBarre: '', prixAchat: '',
    prixVente: '', prixCible: '', prixPlancher: '', negociable: false,
    stock: '', seuilAlerte: '5', description: '',
  });

  const openAdd = () => {
    setEditingProduct(null);
    setForm({
      nom: '', categorie: 'Alimentation', codeBarre: '', prixAchat: '',
      prixVente: '', prixCible: '', prixPlancher: '', negociable: false,
      stock: '', seuilAlerte: '5', description: '',
    });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      nom: p.nom, categorie: p.categorie, codeBarre: p.codeBarre,
      prixAchat: String(p.prixAchat), prixVente: String(p.prixVente),
      prixCible: p.prixCible !== undefined ? String(p.prixCible) : '',
      prixPlancher: p.prixPlancher !== undefined ? String(p.prixPlancher) : '',
      negociable: p.negociable === true,
      stock: String(p.stock), seuilAlerte: String(p.seuilAlerte), description: p.description || '',
    });
    setShowModal(true);
  };

  // Non-blocking EAN-13 validation (only when field is non-empty)
  const barcodeWarning = form.codeBarre.trim() && !isValidEAN13(form.codeBarre.trim())
    ? t('produits.barcodeInvalid')
    : null;

  // Duplicate check: same code on a different product
  const barcodeDuplicate = form.codeBarre.trim()
    ? products.find(p => p.codeBarre === form.codeBarre.trim() && p.id !== editingProduct?.id) ?? null
    : null;

  const handleSubmit = () => {
    if (!form.nom || !form.prixAchat || !form.prixVente) {
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

    const data = {
      nom: form.nom, categorie: form.categorie, codeBarre,
      prixAchat: prixAchatNum, prixVente: prixVenteNum,
      prixCible: form.negociable ? prixCibleNum : undefined,
      prixPlancher: form.negociable ? prixPlancherNum : undefined,
      negociable: form.negociable,
      stock: editingProduct ? editingProduct.stock : (parseInt(form.stock, 10) || 0),
      seuilAlerte: parseInt(form.seuilAlerte, 10) || 5, description: form.description,
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
    const inCart = cart.find(c => c.productId === deleteTarget.id);
    if (inCart) {
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

  let filtered = products.filter(p => p.nom.toLowerCase().includes(search.toLowerCase()) || p.codeBarre.includes(search));
  if (catFilter) filtered = filtered.filter(p => p.categorie === catFilter);
  if (stockFilter === 'ok') filtered = filtered.filter(p => p.stock > p.seuilAlerte);
  if (stockFilter === 'low') filtered = filtered.filter(p => p.stock > 0 && p.stock <= p.seuilAlerte);
  if (stockFilter === 'out') filtered = filtered.filter(p => p.stock <= 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl nova-heading text-foreground">{t('produits.title')}</h1>
        <button onClick={openAdd} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5 shrink-0">
          <Plus className="w-4 h-4" /> {t('produits.addBtn')}
        </button>
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
                  const status = getStockStatus(p.stock, p.seuilAlerte);
                  const margin = ((p.prixVente - p.prixAchat) / p.prixAchat * 100);
                  const isInternal = p.codeBarre.startsWith('2');
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors group">
                      <td className="p-3 text-sm text-muted-foreground">{i + 1}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 lg:gap-3">
                          {productImages[p.id] ? (
                            <img src={productImages[p.id]} alt={p.nom} className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">{p.nom}</p>
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.categorie}</span>
                          </div>
                        </div>
                      </td>
                      <td
                        className="p-3 text-sm font-mono text-muted-foreground cursor-pointer hover:text-foreground hidden md:table-cell"
                        onClick={() => { navigator.clipboard.writeText(p.codeBarre); toast.success(t('produits.copied')); }}
                      >
                        <span className="flex items-center gap-1.5">
                          {p.codeBarre}
                          {isInternal && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-600 px-1 py-0.5 rounded font-sans">vrac</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 money text-right text-muted-foreground hidden sm:table-cell">{formatFCFA(p.prixAchat)}</td>
                      <td className="p-3 money text-right text-foreground">{formatFCFA(p.prixVente)}</td>
                      <td className={cn('p-3 text-sm text-right font-medium tabular-nums hidden sm:table-cell', margin >= 20 ? 'text-emerald-400' : margin >= 10 ? 'text-amber-400' : 'text-red-400')}>
                        {margin.toFixed(1)}%
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <StatusBadge status={status} />
                          <span className="text-sm tabular-nums text-foreground">{p.stock}</span>
                        </div>
                      </td>
                      <td className="p-3 money text-right text-muted-foreground hidden md:table-cell">{p.seuilAlerte}</td>
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
                <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as Category })} className="nova-input w-full">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* ── Code-barres ─────────────────────────────────────────── */}
              <div>
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
                  {/* Camera scan — for packaged products with a manufacturer barcode */}
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    title={t('produits.scanBtn')}
                    className="px-3 rounded-lg border border-border bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  {/* Generate internal code — for bulk/loose products without a factory barcode */}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelPurchasePrice')}</label>
                  <input type="number" value={form.prixAchat} onChange={e => setForm({ ...form, prixAchat: e.target.value })} className="nova-input w-full" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelSalePrice')}</label>
                  <input type="number" value={form.prixVente} onChange={e => setForm({ ...form, prixVente: e.target.value })} className="nova-input w-full" />
                </div>
              </div>
              {form.prixAchat && form.prixVente && (
                <div className={cn('text-sm font-medium', marge >= 20 ? 'text-emerald-400' : marge >= 10 ? 'text-amber-400' : 'text-red-400')}>
                  {t('produits.colMargin')}: {formatFCFA((parseInt(form.prixVente, 10) || 0) - (parseInt(form.prixAchat, 10) || 0))} ({marge.toFixed(1)}%)
                </div>
              )}

              {/* ── Négociation ─────────────────────────────────────────── */}
              <div className="border-t border-border pt-4">
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

              {!editingProduct && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('produits.labelInitialStock')}</label>
                  <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="nova-input w-full" />
                </div>
              )}
              <div>
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

      {/* Camera barcode scanner — for reading manufacturer codes on packaged products */}
      <BarcodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={code => { setForm(f => ({ ...f, codeBarre: code })); }}
      />

      {/* Label print — only shown for internal (prefix '2') products */}
      <LabelPrint
        product={labelProduct}
        onClose={() => setLabelProduct(null)}
      />
    </div>
  );
};

export default ProduitsPage;
