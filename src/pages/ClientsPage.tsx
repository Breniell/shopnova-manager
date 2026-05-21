/**
 * ClientsPage — gestion des clients de la boutique.
 *
 * Fonctionnalités :
 *   • Liste avec KPI (total, nb d'achats, encours futur)
 *   • Recherche par nom/téléphone
 *   • Toggle d'affichage des archivés
 *   • CRUD complet (ajouter, modifier, archiver/désarchiver, supprimer)
 *   • Drawer "Détails client" avec historique des achats
 *
 * Permissions :
 *   • Gérant : tout (créer, modifier, archiver, supprimer)
 *   • Caissier : créer et modifier seulement (pas d'archive ni de suppression)
 */
import React, { useState, useMemo } from 'react';
import { useCustomerStore, Customer } from '@/stores/useCustomerStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { formatFCFA, formatDateShort } from '@/utils/formatters';
import {
  Search, Plus, Edit, Trash2, Archive, ArchiveRestore,
  Users, X, Phone, Mail, MapPin, Eye, UserCircle, ShoppingBag
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ClientsPage: React.FC = () => {
  const { customers, addCustomer, updateCustomer, archiveCustomer, unarchiveCustomer, deleteCustomer } = useCustomerStore();
  const { sales } = useSaleStore();
  const { currentUser } = useAuthStore();
  const isGerant = currentUser?.role === 'gérant';

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [detailsCustomer, setDetailsCustomer] = useState<Customer | null>(null);

  const [form, setForm] = useState({
    prenom: '', nom: '', telephone: '', email: '', adresse: '', notes: '',
    plafondCredit: '' as string,  // string pour permettre vide
  });

  // ── Stats globales ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeCustomers = customers.filter(c => !c.archived);
    const totalActive = activeCustomers.length;
    const totalArchived = customers.length - totalActive;

    // Calcul des stats par client
    const salesByCustomer = new Map<string, { count: number; total: number }>();
    sales.forEach(s => {
      if (s.customerId && s.status !== 'refunded') {
        const current = salesByCustomer.get(s.customerId) ?? { count: 0, total: 0 };
        current.count += 1;
        current.total += s.total;
        salesByCustomer.set(s.customerId, current);
      }
    });

    const totalCAClients = Array.from(salesByCustomer.values()).reduce((sum, s) => sum + s.total, 0);
    const nbClientsWithSales = salesByCustomer.size;

    return { totalActive, totalArchived, totalCAClients, nbClientsWithSales, salesByCustomer };
  }, [customers, sales]);

  // ── Liste filtrée ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers
      .filter(c => showArchived ? c.archived : !c.archived)
      .filter(c => {
        if (!q) return true;
        return c.prenom.toLowerCase().includes(q) ||
               c.nom.toLowerCase().includes(q) ||
               c.telephone.replace(/\s/g, '').includes(q.replace(/\s/g, ''));
      })
      .sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`));
  }, [customers, search, showArchived]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm({ prenom: '', nom: '', telephone: '', email: '', adresse: '', notes: '', plafondCredit: '' });
    setShowModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      prenom: c.prenom,
      nom: c.nom,
      telephone: c.telephone,
      email: c.email || '',
      adresse: c.adresse || '',
      notes: c.notes || '',
      plafondCredit: c.plafondCredit !== undefined ? String(c.plafondCredit) : '',
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim()) {
      toast.error('Prénom, nom et téléphone sont requis');
      return;
    }
    if (form.telephone.replace(/\D/g, '').length < 9) {
      toast.error('Numéro de téléphone invalide (9 chiffres minimum)');
      return;
    }

    const plafond = form.plafondCredit.trim();
    const plafondCredit = plafond ? Number(plafond) : undefined;
    if (plafond && (isNaN(plafondCredit!) || plafondCredit! < 0)) {
      toast.error('Plafond de crédit invalide');
      return;
    }

    const data = {
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      telephone: form.telephone.trim(),
      email: form.email.trim() || undefined,
      adresse: form.adresse.trim() || undefined,
      notes: form.notes.trim() || undefined,
      plafondCredit,
    };

    try {
      if (editing) {
        updateCustomer(editing.id, data);
        toast.success('Client mis à jour');
      } else {
        addCustomer(data);
        toast.success('Client ajouté');
      }
      setShowModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handleArchive = () => {
    if (!archiveTarget) return;
    if (archiveTarget.archived) {
      unarchiveCustomer(archiveTarget.id);
      toast.success(`${archiveTarget.prenom} ${archiveTarget.nom} réactivé`);
    } else {
      archiveCustomer(archiveTarget.id);
      toast.success(`${archiveTarget.prenom} ${archiveTarget.nom} archivé`);
    }
    setArchiveTarget(null);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    // Vérification : refuse la suppression si le client a des ventes
    const hasSales = sales.some(s => s.customerId === deleteTarget.id);
    if (hasSales) {
      toast.error('Ce client a un historique de ventes. Utilisez "Archiver" pour préserver l\'historique.');
      setDeleteTarget(null);
      return;
    }
    deleteCustomer(deleteTarget.id);
    toast.success('Client supprimé');
    setDeleteTarget(null);
  };

  // ── Détails du client sélectionné (drawer) ───────────────────────────────
  const customerSales = useMemo(() => {
    if (!detailsCustomer) return [];
    return sales
      .filter(s => s.customerId === detailsCustomer.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);
  }, [detailsCustomer, sales]);

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-grid">
        <h1 className="text-headline-lg nova-heading text-foreground">Clients</h1>
        <button onClick={openAdd} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5">
          <Plus className="w-4 h-4" /> Ajouter un client
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-grid mb-6">
        <NovaCard accent>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Clients actifs</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{stats.totalActive}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/15 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avec achats</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{stats.nbClientsWithSales}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <UserCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">CA généré</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatFCFA(stats.totalCAClients)}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Archive className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Archivés</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{stats.totalArchived}</p>
            </div>
          </div>
        </NovaCard>
      </div>

      {/* Recherche + filtre */}
      <div className="flex flex-col sm:flex-row gap-grid mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="nova-input w-full pl-10"
            placeholder="Rechercher par nom ou téléphone..."
          />
        </div>
        {isGerant && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox" checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Voir les archivés
          </label>
        )}
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={showArchived ? 'Aucun client archivé' : 'Aucun client'}
          description={showArchived ? 'Les clients archivés apparaîtront ici.' : 'Ajoutez vos clients pour suivre leurs achats et leurs crédits.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const customerStats = stats.salesByCustomer.get(c.id);
            return (
              <NovaCard key={c.id} accent className={c.archived ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-grid">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.prenom[0]}{c.nom[0]}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {c.prenom} {c.nom}
                      </h3>
                      {c.archived && (
                        <span className="inline-block text-[9px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded mt-0.5">
                          Archivé
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setDetailsCustomer(c)}
                      aria-label="Voir détails"
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      aria-label="Modifier"
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {isGerant && (
                      <>
                        <button
                          onClick={() => setArchiveTarget(c)}
                          aria-label={c.archived ? 'Désarchiver' : 'Archiver'}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          {c.archived
                            ? <ArchiveRestore className="w-4 h-4" />
                            : <Archive className="w-4 h-4" />}
                        </button>
                        {!customerStats && (
                          <button
                            onClick={() => setDeleteTarget(c)}
                            aria-label="Supprimer définitivement"
                            className="p-1.5 rounded-lg hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.telephone}</span>
                  </div>
                  {c.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.adresse && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{c.adresse}</span>
                    </div>
                  )}
                </div>
                {customerStats && (
                  <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Achats</p>
                      <p className="font-semibold text-foreground tabular-nums">{customerStats.count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total dépensé</p>
                      <p className="font-semibold text-foreground tabular-nums">{formatFCFA(customerStats.total)}</p>
                    </div>
                  </div>
                )}
                {c.plafondCredit !== undefined && c.plafondCredit > 0 && (
                  <div className="mt-2 text-[11px] text-amber-400">
                    Plafond crédit : {formatFCFA(c.plafondCredit)}
                  </div>
                )}
              </NovaCard>
            );
          })}
        </div>
      )}

      {/* ── Modal Ajout / Édition ─────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="nova-card w-full max-w-[480px] p-6 animate-scale-in max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">
                {editing ? 'Modifier le client' : 'Ajouter un client'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Prénom *</label>
                  <input
                    type="text" value={form.prenom}
                    onChange={e => setForm({ ...form, prenom: e.target.value })}
                    className="nova-input w-full" autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
                  <input
                    type="text" value={form.nom}
                    onChange={e => setForm({ ...form, nom: e.target.value })}
                    className="nova-input w-full"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Téléphone *</label>
                <input
                  type="tel" value={form.telephone}
                  onChange={e => setForm({ ...form, telephone: e.target.value })}
                  className="nova-input w-full" placeholder="+237 6XX XXX XXX"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email</label>
                <input
                  type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="nova-input w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Adresse</label>
                <input
                  type="text" value={form.adresse}
                  onChange={e => setForm({ ...form, adresse: e.target.value })}
                  className="nova-input w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Plafond de crédit (FCFA)
                </label>
                <input
                  type="number" value={form.plafondCredit} min="0"
                  onChange={e => setForm({ ...form, plafondCredit: e.target.value })}
                  className="nova-input w-full"
                  placeholder="Laisser vide = pas de limite"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Utilisé pour limiter les ventes à crédit. 0 = crédit interdit. Vide = pas de limite.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="nova-input w-full h-16 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-grid mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                Annuler
              </button>
              <button onClick={handleSubmit} className="flex-1 nova-btn-primary py-2.5">
                {editing ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Archivage / Désarchivage ────────────────────────────────── */}
      {archiveTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setArchiveTarget(null)}
        >
          <div
            className="nova-card p-6 w-full max-w-[400px] animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="nova-heading text-lg text-foreground mb-2">
              {archiveTarget.archived ? 'Réactiver ce client ?' : 'Archiver ce client ?'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {archiveTarget.archived
                ? <>Réactiver <strong className="text-foreground">{archiveTarget.prenom} {archiveTarget.nom}</strong> ? Il redeviendra visible dans la recherche.</>
                : <>Archiver <strong className="text-foreground">{archiveTarget.prenom} {archiveTarget.nom}</strong> ? Son historique d'achats sera préservé, mais il n'apparaîtra plus dans la recherche.</>}
            </p>
            <div className="flex gap-grid">
              <button
                onClick={() => setArchiveTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleArchive}
                className="flex-1 nova-btn-primary py-2.5"
              >
                {archiveTarget.archived ? 'Réactiver' : 'Archiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Suppression définitive ──────────────────────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="nova-card p-6 w-full max-w-[400px] animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="nova-heading text-lg text-foreground mb-2">Supprimer définitivement ?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Supprimer <strong className="text-foreground">{deleteTarget.prenom} {deleteTarget.nom}</strong> de manière permanente ? Cette action est irréversible.
            </p>
            <div className="flex gap-grid">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer Détails client ─────────────────────────────────────────── */}
      <SideDrawer
        open={!!detailsCustomer}
        onClose={() => setDetailsCustomer(null)}
        title={detailsCustomer ? `${detailsCustomer.prenom} ${detailsCustomer.nom}` : ''}
      >
        {detailsCustomer && (
          <div className="space-y-5">
            {/* Avatar + identité */}
            <div className="flex items-center gap-grid">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-semibold text-white"
                style={{ backgroundColor: detailsCustomer.color }}
              >
                {detailsCustomer.prenom[0]}{detailsCustomer.nom[0]}
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  {detailsCustomer.prenom} {detailsCustomer.nom}
                </p>
                <p className="text-xs text-muted-foreground">
                  Client depuis {formatDateShort(new Date(detailsCustomer.dateCreation))}
                </p>
              </div>
            </div>

            {/* Coordonnées */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="w-4 h-4" /> {detailsCustomer.telephone}
              </div>
              {detailsCustomer.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" /> {detailsCustomer.email}
                </div>
              )}
              {detailsCustomer.adresse && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" /> {detailsCustomer.adresse}
                </div>
              )}
            </div>

            {/* Stats */}
            {(() => {
              const cs = stats.salesByCustomer.get(detailsCustomer.id);
              const avgBasket = cs && cs.count > 0 ? Math.round(cs.total / cs.count) : 0;
              return (
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-lg bg-muted/40 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Achats</p>
                    <p className="text-lg font-bold text-foreground">{cs?.count ?? 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                    <p className="text-sm font-bold text-foreground">{formatFCFA(cs?.total ?? 0)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Panier moy.</p>
                    <p className="text-sm font-bold text-foreground">{formatFCFA(avgBasket)}</p>
                  </div>
                </div>
              );
            })()}

            {detailsCustomer.plafondCredit !== undefined && detailsCustomer.plafondCredit > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-xs text-amber-400">
                  Plafond de crédit : <strong>{formatFCFA(detailsCustomer.plafondCredit)}</strong>
                </p>
              </div>
            )}

            {detailsCustomer.notes && (
              <div className="p-3 rounded-lg bg-muted/40">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-foreground italic">{detailsCustomer.notes}</p>
              </div>
            )}

            {/* Historique d'achats */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">
                Derniers achats ({customerSales.length})
              </h4>
              {customerSales.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aucun achat enregistré.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {customerSales.map(s => (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-lg text-xs',
                        s.status === 'refunded' ? 'bg-destructive/10 line-through opacity-60' : 'bg-muted/30'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{s.saleNumber}</p>
                        <p className="text-muted-foreground">
                          {formatDateShort(new Date(s.date))} — {s.items.length} article{s.items.length > 1 ? 's' : ''}
                        </p>
                      </div>
                      <p className="font-semibold text-foreground tabular-nums shrink-0 ml-2">
                        {formatFCFA(s.total)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setDetailsCustomer(null);
                openEdit(detailsCustomer);
              }}
              className="w-full nova-btn-primary py-2.5 flex items-center justify-center gap-2"
            >
              <Edit className="w-4 h-4" /> Modifier ce client
            </button>
          </div>
        )}
      </SideDrawer>
    </div>
  );
};

export default ClientsPage;
