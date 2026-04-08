import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useSaleStore, Sale } from '@/stores/useSaleStore';
import { PaymentBadge } from '@/components/ui/PaymentBadge';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { ReceiptModal } from '@/components/ui/ReceiptModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Receipt, Search, Eye, Printer, CalendarIcon, Download } from 'lucide-react';
import { exportCSV, exportPDF } from '@/lib/export';
import { toast } from 'sonner';
import { formatPrice, formatFCFA, formatDate, formatTime, formatDateShort } from '@/utils/formatters';

const VentesPage: React.FC = () => {
  const { sales } = useSaleStore();
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const filtered = useMemo(() => {
    let result = [...sales];
    if (search) {
      result = result.filter(s => s.saleNumber.toLowerCase().includes(search.toLowerCase()) || s.userName.toLowerCase().includes(search.toLowerCase()));
    }
    if (paymentFilter) {
      result = result.filter(s => s.paymentMode === paymentFilter);
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
  }, [sales, search, paymentFilter, dateFrom, dateTo]);

  const totalRevenue = filtered.reduce((sum, s) => sum + s.total, 0);
  const avgSale = filtered.length > 0 ? Math.round(totalRevenue / filtered.length) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <h1 className="text-headline-lg nova-heading text-foreground">Historique des ventes</h1>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => {
            const headers = ['ID', 'Date', 'Heure', 'Caissier', 'Articles', 'Total', 'Paiement'];
            const rows = filtered.map(s => [s.saleNumber, formatDateShort(new Date(s.date)), formatTime(new Date(s.date)), s.userName, String(s.items.reduce((sum, i) => sum + i.quantity, 0)), formatFCFA(s.total), s.paymentMode]);
            exportCSV('historique-ventes', headers, rows);
            toast.success('Export CSV téléchargé');
          }} className="nova-btn-secondary flex items-center gap-2 px-3 py-2 text-sm">
            <Download className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => {
            const headers = ['ID', 'Date', 'Heure', 'Caissier', 'Articles', 'Total', 'Paiement'];
            const rows = filtered.map(s => [s.saleNumber, formatDateShort(new Date(s.date)), formatTime(new Date(s.date)), s.userName, String(s.items.reduce((sum, i) => sum + i.quantity, 0)), formatFCFA(s.total), s.paymentMode]);
            const summary = [`<strong>${filtered.length}</strong>Ventes`, `<strong>${formatFCFA(totalRevenue)}</strong>Total`, `<strong>${formatFCFA(avgSale)}</strong>Moyenne`];
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
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} className="nova-input w-full pl-10" placeholder="Rechercher par ID ou caissier..." />
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

        <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="nova-input min-w-[140px]">
          <option value="">Tous paiements</option>
          <option value="especes">Espèces</option>
          <option value="mobile_money">Mobile Money</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Receipt className="w-12 h-12" />} title="Aucune vente" description="Les ventes apparaîtront ici" />
      ) : (
        <>
          <div className="nova-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">ID</th>
                    <th className="text-left p-3">Date / Heure</th>
                    <th className="text-left p-3 hidden sm:table-cell">Caissier</th>
                    <th className="text-right p-3 hidden sm:table-cell">Articles</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-center p-3 hidden md:table-cell">Paiement</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedSale(s)}>
                      <td className="p-3 text-xs sm:text-sm font-mono text-primary">{s.saleNumber}</td>
                      <td className="p-3 text-xs sm:text-sm text-muted-foreground whitespace-nowrap">{formatDateShort(new Date(s.date))} {formatTime(new Date(s.date))}</td>
                      <td className="p-3 text-sm text-foreground hidden sm:table-cell">{s.userName}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums hidden sm:table-cell">{s.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                      <td className="p-3 text-sm text-right font-medium text-foreground tabular-nums">{formatFCFA(s.total)}</td>
                      <td className="p-3 text-center hidden md:table-cell"><PaymentBadge mode={s.paymentMode} /></td>
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
          </div>

          {/* Summary bar */}
          <div className="mt-4 nova-card px-4 lg:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{filtered.length} vente{filtered.length > 1 ? 's' : ''}</span>
            <div className="flex flex-wrap gap-3 lg:gap-6">
              <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground tabular-nums">{formatFCFA(totalRevenue)}</strong></span>
              <span className="text-sm text-muted-foreground">Moyenne: <strong className="text-foreground tabular-nums">{formatFCFA(avgSale)}</strong>/vente</span>
            </div>
          </div>
        </>
      )}

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
                    <span className="font-medium text-foreground tabular-nums">{formatPrice(item.quantity * item.prixVente)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sous-total</span><span className="text-foreground tabular-nums">{formatPrice(selectedSale.subtotal)}</span></div>
              {selectedSale.discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Remise</span><span className="text-destructive">{selectedSale.discount}%</span></div>}
              <div className="flex justify-between text-base font-semibold"><span className="text-foreground">Total</span><span className="text-primary tabular-nums">{formatPrice(selectedSale.total)}</span></div>
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
