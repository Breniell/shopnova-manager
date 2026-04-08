import React, { useState } from 'react';
import { useProductStore } from '@/stores/useProductStore';
import { useStockStore } from '@/stores/useStockStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getStockStatus, cn } from '@/lib/utils';
import { Package, AlertTriangle, TrendingDown, Warehouse, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice, formatFCFA, formatDate, formatTime, formatDateShort } from '@/utils/formatters';

const StockPage: React.FC = () => {
  const { products, updateStock } = useProductStore();
  const { movements, addMovement } = useStockStore();
  const { currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'etat' | 'historique'>('etat');
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');

  const outOfStock = products.filter(p => p.stock <= 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.seuilAlerte);
  const totalValue = products.reduce((sum, p) => sum + p.prixAchat * p.stock, 0);

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-headline-lg nova-heading text-foreground">Gestion du stock</h1>
        <button onClick={() => setShowModal(true)} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5 shrink-0">
          <Plus className="w-4 h-4" /> Entrée de stock
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit overflow-x-auto">
        <button onClick={() => setActiveTab('etat')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap', activeTab === 'etat' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          État du stock
        </button>
        <button onClick={() => setActiveTab('historique')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap', activeTab === 'historique' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          Historique des mouvements
        </button>
      </div>

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

      {/* Stock entry modal */}
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
    </div>
  );
};

export default StockPage;
