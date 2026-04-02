import React, { useState, useMemo } from 'react';
import { useSaleStore, Sale } from '@/stores/useSaleStore';
import { PaymentBadge } from '@/components/ui/PaymentBadge';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { ReceiptModal } from '@/components/ui/ReceiptModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatFCFA, formatDateShort, formatTime } from '@/lib/utils';
import { Receipt, Search, Eye, Printer } from 'lucide-react';

const VentesPage: React.FC = () => {
  const { sales } = useSaleStore();
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  const filtered = useMemo(() => {
    let result = [...sales];
    if (search) {
      result = result.filter(s => s.saleNumber.toLowerCase().includes(search.toLowerCase()) || s.userName.toLowerCase().includes(search.toLowerCase()));
    }
    if (paymentFilter) {
      result = result.filter(s => s.paymentMode === paymentFilter);
    }
    return result;
  }, [sales, search, paymentFilter]);

  const totalRevenue = filtered.reduce((sum, s) => sum + s.total, 0);
  const avgSale = filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0;

  return (
    <div className="p-8 animate-fade-in">
      <h1 className="text-2xl nova-heading text-foreground mb-6">Historique des ventes</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="nova-input w-full pl-10" placeholder="Rechercher par ID ou caissier..." />
        </div>
        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="nova-input min-w-[160px]">
          <option value="">Tous les paiements</option>
          <option value="especes">Espèces</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="credit">Crédit</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Receipt className="w-12 h-12" />} title="Aucune vente" description="Les ventes apparaîtront ici" />
      ) : (
        <>
          <div className="nova-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="nova-table-header">
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Date / Heure</th>
                  <th className="text-left p-3">Caissier</th>
                  <th className="text-right p-3">Articles</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-center p-3">Paiement</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedSale(s)}>
                    <td className="p-3 text-sm font-mono text-primary">{s.saleNumber}</td>
                    <td className="p-3 text-sm text-muted-foreground">{formatDateShort(new Date(s.date))} {formatTime(new Date(s.date))}</td>
                    <td className="p-3 text-sm text-foreground">{s.userName}</td>
                    <td className="p-3 text-sm text-right text-foreground tabular-nums">{s.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                    <td className="p-3 text-sm text-right font-medium text-foreground tabular-nums">{formatFCFA(s.total)}</td>
                    <td className="p-3 text-center"><PaymentBadge mode={s.paymentMode} /></td>
                    <td className="p-3 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedSale(s); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary bar */}
          <div className="mt-4 nova-card px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{filtered.length} vente{filtered.length > 1 ? 's' : ''}</span>
            <div className="flex gap-6">
              <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground tabular-nums">{formatFCFA(totalRevenue)}</strong></span>
              <span className="text-sm text-muted-foreground">Moyenne: <strong className="text-foreground tabular-nums">{formatFCFA(avgSale)}</strong>/vente</span>
            </div>
          </div>
        </>
      )}

      {/* Side drawer for sale detail */}
      <SideDrawer open={!!selectedSale} onClose={() => setSelectedSale(null)} title={`Vente ${selectedSale?.saleNumber || ''}`}>
        {selectedSale && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Date</span><span className="text-foreground">{formatDateShort(new Date(selectedSale.date))} {formatTime(new Date(selectedSale.date))}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Caissier</span><span className="text-foreground">{selectedSale.userName}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paiement</span><PaymentBadge mode={selectedSale.paymentMode} /></div>
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
                    <span className="font-medium text-foreground tabular-nums">{formatFCFA(item.quantity * item.prixVente)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sous-total</span><span className="text-foreground tabular-nums">{formatFCFA(selectedSale.subtotal)}</span></div>
              {selectedSale.discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Remise</span><span className="text-destructive">{selectedSale.discount}%</span></div>}
              <div className="flex justify-between text-base font-semibold"><span className="text-foreground">Total</span><span className="text-primary tabular-nums">{formatFCFA(selectedSale.total)}</span></div>
            </div>

            <button onClick={() => { setReceiptSale(selectedSale); setSelectedSale(null); }} className="nova-btn-primary w-full flex items-center justify-center gap-2 py-3">
              <Printer className="w-4 h-4" /> Réimprimer le reçu
            </button>
          </div>
        )}
      </SideDrawer>

      <ReceiptModal sale={receiptSale} open={!!receiptSale} onClose={() => setReceiptSale(null)} />
    </div>
  );
};

export default VentesPage;
