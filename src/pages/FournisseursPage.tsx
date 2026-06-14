import React, { useState } from 'react';
import { useSupplierStore, Supplier } from '@/stores/useSupplierStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search, Plus, Edit, Trash2, Truck, X, Phone, Mail, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';

const FournisseursPage: React.FC = () => {
  const { t } = useTranslation();
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useSupplierStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const [form, setForm] = useState({ nom: '', telephone: '', email: '', adresse: '', notes: '' });

  const openAdd = () => {
    setEditing(null);
    setForm({ nom: '', telephone: '', email: '', adresse: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ nom: s.nom, telephone: s.telephone, email: s.email || '', adresse: s.adresse || '', notes: s.notes || '' });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!form.nom.trim() || !form.telephone.trim()) {
      toast.error(t('fournisseurs.namePhoneRequired'));
      return;
    }
    if (editing) {
      updateSupplier(editing.id, { ...form });
      toast.success(t('fournisseurs.updated'));
    } else {
      addSupplier({ ...form });
      toast.success(t('fournisseurs.added'));
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteSupplier(deleteTarget.id);
      toast.success(t('fournisseurs.deleted'));
      setDeleteTarget(null);
    }
  };

  const filtered = suppliers.filter(s =>
    s.nom.toLowerCase().includes(search.toLowerCase()) ||
    s.telephone.includes(search)
  );

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-grid">
        <h1 className="text-2xl nova-heading text-foreground">{t('fournisseurs.title')}</h1>
        <button onClick={openAdd} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5">
          <Plus className="w-4 h-4" /> {t('fournisseurs.addBtn')}
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="nova-input w-full pl-10" placeholder={t('fournisseurs.searchPlaceholder')} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Truck className="w-12 h-12" />} title={t('fournisseurs.noSupplier')} description={t('fournisseurs.noSupplierDesc')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <NovaCard key={s.id} accent>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-grid">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{s.nom}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} aria-label={t('fournisseurs.editTitle')} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget(s)} aria-label={t('fournisseurs.deleteTitle')} className="p-1.5 rounded-lg hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {s.telephone}</div>
                {s.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {s.email}</div>}
                {s.adresse && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {s.adresse}</div>}
              </div>
              {s.notes && <p className="text-xs text-muted-foreground mt-3 italic">{s.notes}</p>}
            </NovaCard>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="nova-card w-full max-w-[480px] p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">{editing ? t('fournisseurs.editTitle') : t('fournisseurs.addTitle')}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('fournisseurs.labelName')}</label>
                <input type="text" value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} className="nova-input w-full" autoFocus />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('fournisseurs.labelPhone')}</label>
                <input type="text" value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} className="nova-input w-full" placeholder="+237 6XX XXX XXX" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('fournisseurs.labelEmail')}</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('fournisseurs.labelAddress')}</label>
                <input type="text" value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('fournisseurs.labelNotes')}</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="nova-input w-full h-16 resize-none" />
              </div>
            </div>
            <div className="flex gap-grid mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('fournisseurs.cancel')}</button>
              <button onClick={handleSubmit} className="flex-1 nova-btn-primary py-2.5">{editing ? t('fournisseurs.save') : t('fournisseurs.add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="nova-card p-6 w-full max-w-[400px] animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="nova-heading text-lg text-foreground mb-2">{t('fournisseurs.deleteTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {t('fournisseurs.deleteConfirm').replace('{name}', deleteTarget.nom)}
            </p>
            <div className="flex gap-grid">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('fournisseurs.cancel')}</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">{t('fournisseurs.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FournisseursPage;
