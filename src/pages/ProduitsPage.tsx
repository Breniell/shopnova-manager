import React, { useState } from 'react';
import { useProductStore, Product, Category } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatFCFA, getStockStatus, generateEAN13, cn } from '@/lib/utils';
import { productImages } from '@/assets/productImages';
import { Search, Plus, Edit, Trash2, Package, X } from 'lucide-react';
import { toast } from 'sonner';

const ProduitsPage: React.FC = () => {
  const { products, categories, addProduct, updateProduct, deleteProduct } = useProductStore();
  const { cart } = useSaleStore();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('');
  const [stockFilter, setStockFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const [form, setForm] = useState({
    nom: '', categorie: 'Alimentation' as Category, codeBarre: '', prixAchat: '',
    prixVente: '', stock: '', seuilAlerte: '5', description: '',
  });

  const openAdd = () => {
    setEditingProduct(null);
    setForm({ nom: '', categorie: 'Alimentation', codeBarre: '', prixAchat: '', prixVente: '', stock: '', seuilAlerte: '5', description: '' });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      nom: p.nom, categorie: p.categorie, codeBarre: p.codeBarre,
      prixAchat: String(p.prixAchat), prixVente: String(p.prixVente),
      stock: String(p.stock), seuilAlerte: String(p.seuilAlerte), description: p.description || '',
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!form.nom || !form.prixAchat || !form.prixVente) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }
    const data = {
      nom: form.nom, categorie: form.categorie, codeBarre: form.codeBarre || generateEAN13(),
      prixAchat: parseInt(form.prixAchat, 10) || 0, prixVente: parseInt(form.prixVente, 10) || 0,
      stock: editingProduct ? editingProduct.stock : (parseInt(form.stock, 10) || 0),
      seuilAlerte: parseInt(form.seuilAlerte, 10) || 5, description: form.description,
    };
    if (editingProduct) {
      updateProduct(editingProduct.id, data);
      toast.success('Produit mis à jour');
    } else {
      addProduct(data);
      toast.success('Produit ajouté');
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const inCart = cart.find(c => c.productId === deleteTarget.id);
    if (inCart) {
      toast.error("Ce produit est dans le panier. Videz le panier d'abord.");
      setDeleteTarget(null);
      return;
    }
    deleteProduct(deleteTarget.id);
    toast.success('Produit supprimé');
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
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl nova-heading text-foreground">Produits</h1>
        <button onClick={openAdd} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5">
          <Plus className="w-4 h-4" /> Ajouter un produit
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="nova-input w-full pl-10" placeholder="Rechercher..." />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="nova-input min-w-[160px]">
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} className="nova-input min-w-[140px]">
          <option value="">Tous les stocks</option>
          <option value="ok">En stock</option>
          <option value="low">Stock faible</option>
          <option value="out">Rupture</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Package className="w-12 h-12" />} title="Aucun produit trouvé" description="Modifiez vos filtres ou ajoutez un nouveau produit" />
      ) : (
        <div className="nova-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="nova-table-header">
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Produit</th>
                <th className="text-left p-3">Code-barres</th>
                <th className="text-right p-3">P. Achat</th>
                <th className="text-right p-3">P. Vente</th>
                <th className="text-right p-3">Marge</th>
                <th className="text-right p-3">Stock</th>
                <th className="text-right p-3">Seuil</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const status = getStockStatus(p.stock, p.seuilAlerte);
                const margin = ((p.prixVente - p.prixAchat) / p.prixAchat * 100);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors group">
                    <td className="p-3 text-sm text-muted-foreground">{i + 1}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {productImages[p.id] ? (
                          <img src={productImages[p.id]} alt={p.nom} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.nom}</p>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{p.categorie}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-sm font-mono text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => { navigator.clipboard.writeText(p.codeBarre); toast.success('Copié !'); }}>
                      {p.codeBarre}
                    </td>
                    <td className="p-3 text-sm text-right text-muted-foreground tabular-nums">{formatFCFA(p.prixAchat)}</td>
                    <td className="p-3 text-sm text-right text-foreground font-medium tabular-nums">{formatFCFA(p.prixVente)}</td>
                    <td className={cn('p-3 text-sm text-right font-medium tabular-nums', margin >= 20 ? 'text-emerald-400' : margin >= 10 ? 'text-amber-400' : 'text-red-400')}>
                      {margin.toFixed(1)}%
                    </td>
                    <td className="p-3 text-right">
                      <StatusBadge status={status} />
                      <span className="ml-2 text-sm tabular-nums text-foreground">{p.stock}</span>
                    </td>
                    <td className="p-3 text-sm text-right text-muted-foreground tabular-nums">{p.seuilAlerte}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowModal(false)}>
          <div className="nova-card w-[520px] max-h-[90vh] overflow-y-auto p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">{editingProduct ? 'Modifier le produit' : 'Ajouter un produit'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nom du produit *</label>
                <input type="text" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Catégorie</label>
                <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as Category })} className="nova-input w-full">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Code-barres</label>
                <div className="flex gap-2">
                  <input type="text" value={form.codeBarre} onChange={e => setForm({ ...form, codeBarre: e.target.value })} className="nova-input flex-1" placeholder="EAN-13" />
                  <button onClick={() => setForm({ ...form, codeBarre: generateEAN13() })} className="nova-btn-primary px-3 text-sm">Générer</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Prix d'achat FCFA *</label>
                  <input type="number" value={form.prixAchat} onChange={e => setForm({ ...form, prixAchat: e.target.value })} className="nova-input w-full" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Prix de vente FCFA *</label>
                  <input type="number" value={form.prixVente} onChange={e => setForm({ ...form, prixVente: e.target.value })} className="nova-input w-full" />
                </div>
              </div>
              {form.prixAchat && form.prixVente && (
                <div className={cn('text-sm font-medium', marge >= 20 ? 'text-emerald-400' : marge >= 10 ? 'text-amber-400' : 'text-red-400')}>
                  Marge: {formatFCFA((parseInt(form.prixVente, 10) || 0) - (parseInt(form.prixAchat, 10) || 0))} ({marge.toFixed(1)}%)
                </div>
              )}
              {!editingProduct && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Stock initial</label>
                  <input type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} className="nova-input w-full" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Seuil d'alerte stock</label>
                <input type="number" value={form.seuilAlerte} onChange={e => setForm({ ...form, seuilAlerte: e.target.value })} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="nova-input w-full h-20 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button onClick={handleSubmit} className="flex-1 nova-btn-primary py-2.5">{editingProduct ? 'Enregistrer' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setDeleteTarget(null)}>
          <div className="nova-card p-6 w-[400px] animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="nova-heading text-lg text-foreground mb-2">Supprimer le produit ?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Êtes-vous sûr de vouloir supprimer <strong className="text-foreground">{deleteTarget.nom}</strong> ? Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProduitsPage;
