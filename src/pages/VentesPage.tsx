import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useSaleStore, Sale } from '@/stores/useSaleStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { PaymentBadge } from '@/components/ui/PaymentBadge';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { ReceiptModal } from '@/components/ui/ReceiptModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Receipt, Search, Eye, Printer, CalendarIcon, Download, XCircle, AlertTriangle } from 'lucide-react';
import { exportCSV, exportPDF } from '@/lib/export';
import { toast } from 'sonner';
import { formatPrice, formatFCFA, formatTime, formatDateShort, formatDate } from '@/utils/formatters';

const StatusBadgeSale: React.FC<{ status?: string }> = ({ status }) => {
  if (status === 'refunded') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/15 text-destructive">
        <XCircle className="w-3 h-3" /> Annulée
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary/15 text-secondary">
      Validée
    </span>
  );
};

const VentesPage: React.FC = () => {
  const { sales, refundSale } = useSaleStore();
  const { currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [refundTarget, setRefundTarget] = useState<Sale | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const isGerant = currentUser?.role === 'gérant';

  const filtered = useMemo(() => {
    let result = [...sales];
    if (search) {
      result = result.filter(s =>
        s.saleNumber.toLowerCase().includes(search.toLowerCase()) ||
        s.userName.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (paymentFilter) {
      result = result.filter(s => s.paymentMode === paymentFilter);
    }
    if (statusFilter) {
      result = result.filter(s =>
        statusFilter === 'refunded' ? s.status === 'refunded' : s.status !== 'refunded'
      );
    }
    if (dateFrom) {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0);
      result = result.filter(s => new Date(s.date) >= start);
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      result = result.filter(s => new Date(s.date) <= end);
    }
    return result;
  }, [sales, search, paymentFilter, statusFilter, dateFrom, dateTo]);

  // Totals exclude refunded sales
  const activeFiltered = filtered.filter(s => s.status !== 'refunded');
  const totalRevenue = activeFiltered.reduce((sum, s) => sum + s.total, 0);
  const avgSale = activeFiltered.length > 0 ? Math.round(totalRevenue / activeFiltered.length) : 0;

  const handleRefund = () => {
    if (!refundTarget || !currentUser) return;
    if (!refundReason.trim()) { toast.error('Veuillez indiquer un motif d\'annulation'); return; }
    refundSale(refundTarget.id, refundReason.trim(), currentUser.id, `${currentUser.prenom} ${currentUser.nom}`);
    toast.success(`Vente ${refundTarget.saleNumber} annulée — stock restitué`);
    setRefundTarget(null);
    setRefundReason('');
    setSelectedSale(null);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-headline-lg nova-heading text-foreground">Historique des ventes</h1>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => {
            const headers = ['ID', 'Date', 'Heure', 'Caissier', 'Articles', 'Total', 'Paiement', 'Statut'];
            const rows = filtered.map(s => [
              s.saleNumber,
              formatDateShort(new Date(s.date)),
              formatTime(new Date(s.date)),
              s.userName,
              String(s.items.reduce((sum, i) => sum + i.quantity, 0)),
              formatFCFA(s.total),
              s.paymentMode,
              s.status === 'refunded' ? 'Annulée' : 'Validée',
            ]);
            exportCSV('historique-ventes', headers, rows);
            toast.success('Export CSV téléchargé');
          }} className="nova-btn-secondary flex items-center gap-2 px-3 py-2 text-sm">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => {
            const headers = ['ID', 'Date', 'Heure', 'Caissier', 'Articles', 'Total', 'Paiement', 'Statut'];
            const rows = filtered.map(s => [
              s.saleNumber,
              formatDateShort(new Date(s.date)),
              formatTime(new Date(s.date)),
              s.userName,
              String(s.items.reduce((sum, i) => sum + i.quantity, 0)),
              formatFCFA(s.total),
              s.paymentMode,
              s.status === 'refunded' ? 'Annulée' : 'Validée',
            ]);
            const summary = [
              `<strong>${activeFiltered.length}</strong>Ventes actives`,
              `<strong>${formatFCFA(totalRevenue)}</strong>Total`,
              `<strong>${formatFCFA(avgSale)}</strong>Moyenne`,
            ];
            exportPDF('Historique des ventes — Legwan', headers, rows, summary);
          }} className="nova-btn-secondary flex items-center gap-2 px-3 py-2 text-sm">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="nova-input w-full pl-10"
            placeholder="Rechercher par ID ou caissier..."
            aria-label="Rechercher une vente"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("min-w-[140px] justify-start text-left font-normal text-sm", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Début"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("min-w-[140px] justify-start text-left font-normal text-sm", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fin"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {(dateFrom || dateTo) && (
          <Button variant="ghost" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }} className="text-muted-foreground hover:text-foreground text-sm">
            Réinitialiser
          </Button>
        )}

        <select
          value={paymentFilter}
          onChange={e => setPaymentFilter(e.target.value)}
          className="nova-input min-w-[140px]"
          aria-label="Filtrer par paiement"
        >
          <option value="">Tous paiements</option>
          <option value="especes">Espèces</option>
          <option value="mobile_money">Mobile Money</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="nova-input min-w-[130px]"
          aria-label="Filtrer par statut"
        >
          <option value="">Tous statuts</option>
          <option value="completed">Validées</option>
          <option value="refunded">Annulées</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Receipt className="w-12 h-12" />} title="Aucune vente" description="Les ventes apparaîtront ici" />
      ) : (
        <>
          <div className="nova-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]" role="table" aria-label="Liste des ventes">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">ID</th>
                    <th className="text-left p-3">Date / Heure</th>
                    <th className="text-left p-3 hidden sm:table-cell">Caissier</th>
                    <th className="text-right p-3 hidden sm:table-cell">Articles</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-center p-3 hidden md:table-cell">Paiement</th>
                    <th className="text-center p-3">Statut</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr
                      key={s.id}
                      className={cn(
                        'border-t border-border hover:bg-muted/30 transition-colors cursor-pointer',
                        s.status === 'refunded' && 'opacity-60'
                      )}
                      onClick={() => setSelectedSale(s)}
                    >
                      <td className="p-3 text-xs sm:text-sm font-mono text-primary">{s.saleNumber}</td>
                      <td className="p-3 text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateShort(new Date(s.date))} {formatTime(new Date(s.date))}
                      </td>
                      <td className="p-3 text-sm text-foreground hidden sm:table-cell">{s.userName}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums hidden sm:table-cell">
                        {s.items.reduce((sum, i) => sum + i.quantity, 0)}
                      </td>
                      <td className={cn('p-3 text-sm text-right font-medium tabular-nums', s.status === 'refunded' ? 'line-through text-muted-foreground' : 'text-foreground')}>
                        {formatFCFA(s.total)}
                      </td>
                      <td className="p-3 text-center hidden md:table-cell">
                        <PaymentBadge mode={s.paymentMode} />
                      </td>
                      <td className="p-3 text-center">
                        <StatusBadgeSale status={s.status} />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedSale(s); }}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                            aria-label="Voir les détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isGerant && s.status !== 'refunded' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setRefundTarget(s); setRefundReason(''); }}
                              className="p-1.5 rounded-lg hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
                              aria-label="Annuler la vente"
                              title="Annuler la vente"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary bar */}
          <div className="mt-4 nova-card px-4 lg:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {filtered.length} vente{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
              {filtered.length !== activeFiltered.length && (
                <span className="ml-2 text-destructive/70">
                  ({filtered.length - activeFiltered.length} annulée{filtered.length - activeFiltered.length > 1 ? 's' : ''})
                </span>
              )}
            </span>
            <div className="flex flex-wrap gap-3 lg:gap-6">
              <span className="text-sm text-muted-foreground">
                CA: <strong className="text-foreground tabular-nums">{formatFCFA(totalRevenue)}</strong>
              </span>
              <span className="text-sm text-muted-foreground">
                Moyenne: <strong className="text-foreground tabular-nums">{formatFCFA(avgSale)}</strong>/vente
              </span>
            </div>
          </div>
        </>
      )}

      {/* Sale detail drawer */}
      <SideDrawer open={!!selectedSale} onClose={() => setSelectedSale(null)} title={`Vente ${selectedSale?.saleNumber || ''}`}>
        {selectedSale && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Statut</span>
                <StatusBadgeSale status={selectedSale.status} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span className="text-foreground">{formatDateShort(new Date(selectedSale.date))} {formatTime(new Date(selectedSale.date))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Caissier</span>
                <span className="text-foreground">{selectedSale.userName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paiement</span>
                <PaymentBadge mode={selectedSale.paymentMode} />
              </div>
              {selectedSale.status === 'refunded' && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1">
                  <p className="text-xs font-medium text-destructive">Vente annulée</p>
                  {selectedSale.refundReason && <p className="text-xs text-destructive/80">Motif : {selectedSale.refundReason}</p>}
                  {selectedSale.refundedBy && <p className="text-xs text-destructive/80">Par : {selectedSale.refundedBy}</p>}
                  {selectedSale.refundedAt && <p className="text-xs text-muted-foreground">{formatDate(new Date(selectedSale.refundedAt))}</p>}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Articles</h4>
              <div className="space-y-2">
                {selectedSale.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm p-2 rounded-lg bg-muted/30">
                    <div>
                      <span className="text-foreground">{item.nom}</span>
                      <span className="text-muted-foreground ml-2">{item.quantity} × {formatFCFA(item.prixVente)}</span>
                    </div>
                    <span className="font-medium text-foreground tabular-nums">{formatPrice(item.quantity * item.prixVente)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sous-total</span>
                <span className="text-foreground tabular-nums">{formatPrice(selectedSale.subtotal)}</span>
              </div>
              {selectedSale.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remise</span>
                  <span className="text-destructive">{selectedSale.discount}%</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold">
                <span className="text-foreground">Total</span>
                <span className="text-primary tabular-nums">{formatPrice(selectedSale.total)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setReceiptSale(selectedSale); setSelectedSale(null); }}
                className="nova-btn-primary w-full flex items-center justify-center gap-2 py-3"
                aria-label="Réimprimer le reçu"
              >
                <Printer className="w-4 h-4" /> Réimprimer le reçu
              </button>
              {isGerant && selectedSale.status !== 'refunded' && (
                <button
                  onClick={() => { setRefundTarget(selectedSale); setRefundReason(''); setSelectedSale(null); }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium"
                  aria-label="Annuler cette vente"
                >
                  <XCircle className="w-4 h-4" /> Annuler la vente
                </button>
              )}
            </div>
          </div>
        )}
      </SideDrawer>

      {/* Refund confirmation modal */}
      {refundTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setRefundTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer l'annulation"
        >
          <div className="nova-card w-full max-w-[420px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="nova-heading text-base text-foreground">Annuler la vente</h2>
                <p className="text-xs text-muted-foreground">{refundTarget.saleNumber} · {formatFCFA(refundTarget.total)}</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Cette action est irréversible. Le stock sera automatiquement restitué pour chaque article.
            </p>

            <div className="mb-5">
              <label className="text-xs text-muted-foreground mb-1.5 block">Motif d'annulation *</label>
              <textarea
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                className="nova-input w-full h-20 resize-none"
                placeholder="Ex: Erreur de caisse, retour client..."
                autoFocus
                aria-label="Motif d'annulation"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRefundTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleRefund}
                disabled={!refundReason.trim()}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-white hover:bg-destructive/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceiptModal sale={receiptSale} open={!!receiptSale} onClose={() => setReceiptSale(null)} />
    </div>
  );
};

export default VentesPage;
