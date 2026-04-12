import React, { useState, useMemo } from 'react';
import { useProductStore } from '@/stores/useProductStore';
import { useStockStore } from '@/stores/useStockStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSupplierStore } from '@/stores/useSupplierStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getStockStatus, cn } from '@/lib/utils';
import { Package, AlertTriangle, TrendingDown, Warehouse, Plus, X, Mail, Send, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatFCFA, formatDateShort, formatTime } from '@/utils/formatters';
import type { Product } from '@/stores/useProductStore';

// ─── Email builder ────────────────────────────────────────────────────────────
function buildMailtoLink(
  supplierEmail: string,
  supplierName: string,
  shopName: string,
  products: Product[],
): string {
  const subject = encodeURIComponent(`Commande urgente – ${shopName}`);

  const productLines = products
    .map(p => `  - ${p.nom} (stock actuel : ${p.stock}, seuil : ${p.seuilAlerte})`)
    .join('\n');

  const body = encodeURIComponent(
    `Bonjour ${supplierName},\n\n` +
    `Nous vous contactons depuis ${shopName} concernant les produits suivants qui sont en rupture ou en stock critique :\n\n` +
    `${productLines}\n\n` +
    `Merci de nous informer de vos délais de livraison et de nous envoyer votre devis dans les plus brefs délais.\n\n` +
    `Cordialement,\n${shopName}`
  );

  return `mailto:${supplierEmail}?subject=${subject}&body=${body}`;
}

const StockPage: React.FC = () => {
  const { products, updateStock } = useProductStore();
  const { movements, addMovement } = useStockStore();
  const { currentUser } = useAuthStore();
  const { suppliers } = useSupplierStore();
  const { shop } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'etat' | 'historique' | 'alertes'>('etat');

  // ── Stock entry modal ──
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');

  // ── Email modal ──
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedAlertProducts, setSelectedAlertProducts] = useState<Set<string>>(new Set());

  const outOfStock = products.filter(p => p.stock <= 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.seuilAlerte);
  const alertProducts = [...outOfStock, ...lowStock];
  const totalValue = products.reduce((sum, p) => sum + p.prixAchat * p.stock, 0);

  const suppliersWithEmail = suppliers.filter(s => s.email);

  const handleProductSelect = (id: string) => {
    setSelectedProduct(id);
    const p = products.find(pr => pr.id === id);
    if (p) setUnitPrice(String(p.prixAchat));
  };

  const handleSubmit = () => {
    if (!selectedProduct || !qty) {
      toast.error('Veuillez sélectionner un produit et une quantité');
      return;
    }
    const product = products.find(p => p.id === selectedProduct);
    if (!product || !currentUser) return;

    const quantity = parseInt(qty);
    updateStock(product.id, quantity);
    addMovement({
      date: new Date(),
      productId: product.id,
      productName: product.nom,
      type: 'entrée',
      quantity,
      stockBefore: product.stock,
      stockAfter: product.stock + quantity,
      userId: currentUser.id,
      userName: `${currentUser.prenom} ${currentUser.nom}`,
      supplier,
      unitPrice: unitPrice ? parseInt(unitPrice) : undefined,
      notes,
    });

    toast.success(`${quantity} unités ajoutées à ${product.nom}`);
    setShowModal(false);
    setSelectedProduct('');
    setQty('');
    setSupplier('');
    setNotes('');
  };

  const toggleAlertProduct = (id: string) => {
    setSelectedAlertProducts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllAlerts = () => {
    setSelectedAlertProducts(new Set(alertProducts.map(p => p.id)));
  };

  const handleSendEmail = () => {
    const s = suppliers.find(sup => sup.id === selectedSupplierId);
    if (!s || !s.email) {
      toast.error('Sélectionnez un fournisseur avec un email');
      return;
    }
    if (selectedAlertProducts.size === 0) {
      toast.error('Sélectionnez au moins un produit');
      return;
    }
    const chosen = alertProducts.filter(p => selectedAlertProducts.has(p.id));
    const link = buildMailtoLink(s.email, s.nom, shop.nom, chosen);
    window.open(link, '_blank');
    toast.success('Application mail ouverte avec le message pré-rempli');
    setShowEmailModal(false);
  };

  const openEmailModal = () => {
    setSelectedAlertProducts(new Set(alertProducts.map(p => p.id)));
    setSelectedSupplierId(suppliersWithEmail[0]?.id ?? '');
    setShowEmailModal(true);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-headline-lg nova-heading text-foreground">Gestion du stock</h1>
        <div className="flex gap-2">
          {alertProducts.length > 0 && (
            <button
              onClick={openEmailModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors text-sm font-medium"
            >
              <Mail className="w-4 h-4" />
              <span className="hidden sm:inline">Alerter fournisseur</span>
              <span className="sm:hidden">Email</span>
              <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {alertProducts.length}
              </span>
            </button>
          )}
          <button onClick={() => setShowModal(true)} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5 shrink-0">
            <Plus className="w-4 h-4" /> Entrée de stock
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit overflow-x-auto">
        <button onClick={() => setActiveTab('etat')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap', activeTab === 'etat' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          État du stock
        </button>
        <button onClick={() => setActiveTab('historique')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap', activeTab === 'historique' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          Historique
        </button>
        <button onClick={() => setActiveTab('alertes')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5', activeTab === 'alertes' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          Alertes
          {alertProducts.length > 0 && (
            <span className="bg-destructive text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {alertProducts.length > 9 ? '9+' : alertProducts.length}
            </span>
          )}
        </button>
      </div>

      {/* ── État ── */}
      {activeTab === 'etat' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
            <StatCard icon={<Package className="w-4 h-4 text-primary" />} iconBg="bg-primary/20" value={String(products.length)} label="Total produits" />
            <StatCard icon={<AlertTriangle className="w-4 h-4 text-destructive" />} iconBg="bg-destructive/20" value={String(outOfStock.length)} label="En rupture" />
            <StatCard icon={<TrendingDown className="w-4 h-4 text-amber-400" />} iconBg="bg-amber-500/20" value={String(lowStock.length)} label="Stock faible" />
            <StatCard icon={<Warehouse className="w-4 h-4 text-secondary" />} iconBg="bg-secondary/20" value={formatFCFA(totalValue)} label="Valeur totale" />
          </div>

          <div className="nova-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">Produit</th>
                    <th className="text-left p-3 hidden sm:table-cell">Catégorie</th>
                    <th className="text-right p-3">Stock</th>
                    <th className="text-right p-3 hidden sm:table-cell">Seuil</th>
                    <th className="text-center p-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-sm font-medium text-foreground">{p.nom}</td>
                      <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">{p.categorie}</td>
                      <td className="p-3 text-sm text-right font-medium text-foreground tabular-nums">{p.stock}</td>
                      <td className="p-3 text-sm text-right text-muted-foreground tabular-nums hidden sm:table-cell">{p.seuilAlerte}</td>
                      <td className="p-3 text-center"><StatusBadge status={getStockStatus(p.stock, p.seuilAlerte)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Historique ── */}
      {activeTab === 'historique' && (
        <div className="nova-card overflow-hidden">
          {movements.length === 0 ? (
            <EmptyState icon={<Warehouse className="w-12 h-12" />} title="Aucun mouvement" description="Les mouvements de stock apparaîtront ici" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Produit</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-right p-3">Qté</th>
                    <th className="text-right p-3 hidden md:table-cell">Avant</th>
                    <th className="text-right p-3 hidden md:table-cell">Après</th>
                    <th className="text-left p-3 hidden sm:table-cell">Utilisateur</th>
                    <th className="text-left p-3 hidden lg:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{formatDateShort(new Date(m.date))} {formatTime(new Date(m.date))}</td>
                      <td className="p-3 text-sm font-medium text-foreground">{m.productName}</td>
                      <td className="p-3">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap', m.type === 'entrée' ? 'bg-emerald-500/10 text-emerald-400' : m.type === 'vente' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400')}>
                          {m.type.charAt(0).toUpperCase() + m.type.slice(1)}
                        </span>
                      </td>
                      <td className={cn('p-3 text-sm text-right font-medium tabular-nums', m.quantity > 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </td>
                      <td className="p-3 text-sm text-right text-muted-foreground tabular-nums hidden md:table-cell">{m.stockBefore}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums hidden md:table-cell">{m.stockAfter}</td>
                      <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">{m.userName}</td>
                      <td className="p-3 text-sm text-muted-foreground hidden lg:table-cell">{m.supplier || m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Alertes ── */}
      {activeTab === 'alertes' && (
        <>
          {alertProducts.length === 0 ? (
            <NovaCard>
              <EmptyState
                icon={<Package className="w-12 h-12" />}
                title="Aucune alerte"
                description="Tous les produits sont au-dessus de leur seuil d'alerte"
              />
            </NovaCard>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  {outOfStock.length > 0 && <span className="text-destructive font-medium">{outOfStock.length} en rupture</span>}
                  {outOfStock.length > 0 && lowStock.length > 0 && <span className="text-muted-foreground"> · </span>}
                  {lowStock.length > 0 && <span className="text-amber-400 font-medium">{lowStock.length} stock faible</span>}
                </p>
                <button onClick={openEmailModal} className="flex items-center gap-2 nova-btn-primary px-4 py-2 text-sm">
                  <Send className="w-4 h-4" /> Envoyer email fournisseur
                </button>
              </div>

              {outOfStock.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Rupture de stock
                  </h3>
                  <div className="nova-card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="nova-table-header">
                          <th className="text-left p-3">Produit</th>
                          <th className="text-left p-3 hidden sm:table-cell">Catégorie</th>
                          <th className="text-right p-3">Stock</th>
                          <th className="text-right p-3">Seuil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outOfStock.map(p => (
                          <tr key={p.id} className="border-t border-border bg-destructive/5">
                            <td className="p-3 text-sm font-medium text-foreground">{p.nom}</td>
                            <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">{p.categorie}</td>
                            <td className="p-3 text-sm text-right font-bold text-destructive tabular-nums">{p.stock}</td>
                            <td className="p-3 text-sm text-right text-muted-foreground tabular-nums">{p.seuilAlerte}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {lowStock.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" /> Stock faible
                  </h3>
                  <div className="nova-card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="nova-table-header">
                          <th className="text-left p-3">Produit</th>
                          <th className="text-left p-3 hidden sm:table-cell">Catégorie</th>
                          <th className="text-right p-3">Stock</th>
                          <th className="text-right p-3">Seuil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lowStock.map(p => (
                          <tr key={p.id} className="border-t border-border bg-amber-500/5">
                            <td className="p-3 text-sm font-medium text-foreground">{p.nom}</td>
                            <td className="p-3 text-sm text-muted-foreground hidden sm:table-cell">{p.categorie}</td>
                            <td className="p-3 text-sm text-right font-bold text-amber-400 tabular-nums">{p.stock}</td>
                            <td className="p-3 text-sm text-right text-muted-foreground tabular-nums">{p.seuilAlerte}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Stock entry modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="nova-card w-full max-w-[480px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">Entrée de stock</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Produit *</label>
                <select value={selectedProduct} onChange={e => handleProductSelect(e.target.value)} className="nova-input w-full">
                  <option value="">Sélectionner...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.nom} (stock: {p.stock})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantité reçue *</label>
                <input type="number" value={qty} onChange={e => setQty(e.target.value)} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Prix d'achat unitaire</label>
                <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fournisseur</label>
                <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="nova-input w-full h-20 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button onClick={handleSubmit} className="flex-1 nova-btn-primary py-2.5">Valider l'entrée</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email fournisseur modal ── */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowEmailModal(false)}>
          <div className="nova-card w-full max-w-[520px] p-5 lg:p-6 animate-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="nova-heading text-lg text-foreground">Email fournisseur</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Un email pré-rempli sera ouvert dans votre messagerie</p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {/* Supplier selector */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1 block">Fournisseur destinataire *</label>
              {suppliersWithEmail.length === 0 ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  Aucun fournisseur n'a d'email enregistré. Ajoutez un email dans la fiche fournisseur.
                </div>
              ) : (
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="nova-input w-full"
                >
                  <option value="">Sélectionner un fournisseur...</option>
                  {suppliersWithEmail.map(s => (
                    <option key={s.id} value={s.id}>{s.nom} — {s.email}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Product selection */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground">Produits à inclure</label>
                <button onClick={selectAllAlerts} className="text-xs text-primary hover:underline">Tout sélectionner</button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {alertProducts.map(p => (
                  <label key={p.id} className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border',
                    selectedAlertProducts.has(p.id)
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-muted/30 border-transparent hover:bg-muted/50'
                  )}>
                    <input
                      type="checkbox"
                      checked={selectedAlertProducts.has(p.id)}
                      onChange={() => toggleAlertProduct(p.id)}
                      className="accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground block truncate">{p.nom}</span>
                      <span className="text-xs text-muted-foreground">Stock : {p.stock} / Seuil : {p.seuilAlerte}</span>
                    </div>
                    <StatusBadge status={getStockStatus(p.stock, p.seuilAlerte)} />
                  </label>
                ))}
              </div>
            </div>

            {/* Preview */}
            {selectedSupplierId && selectedAlertProducts.size > 0 && (() => {
              const s = suppliers.find(sup => sup.id === selectedSupplierId);
              if (!s) return null;
              return (
                <div className="mb-5 p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Aperçu de l'objet</p>
                  <p className="text-sm text-foreground">Commande urgente – {shop.nom}</p>
                </div>
              );
            })()}

            <div className="flex gap-3">
              <button onClick={() => setShowEmailModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button
                onClick={handleSendEmail}
                disabled={!selectedSupplierId || selectedAlertProducts.size === 0}
                className="flex-1 nova-btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" /> Ouvrir la messagerie
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockPage;
