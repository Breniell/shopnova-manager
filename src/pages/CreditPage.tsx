/**
 * CreditPage — Gestion des créances et règlements crédit.
 *
 * 3 onglets :
 *   1. Vue par client  : encours regroupés par client, expand pour voir les ventes
 *   2. Vue par vente   : tableau de toutes les ventes à crédit non soldées
 *   3. Règlements     : historique de tous les Payment reçus
 *
 * Action principale : "Encaisser un règlement" sur une vente non soldée.
 * Accessible aux caissiers ET aux gérants (utile pour le caissier en boutique).
 */
import React, { useState, useMemo } from 'react';
import { useSaleStore, type Sale } from '@/stores/useSaleStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTranslation } from '@/i18n';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  getRemainingBalance, getCustomerOutstanding, getAllOpenCreditSales,
  getCustomerOpenCreditSales, getCreditAgeBucket, getCreditAgeInDays,
  getPaymentSignedAmount,
} from '@/lib/credit';
import { formatFCFA, formatDateShort, getCurrentBcp47 } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import {
  Receipt, Users, History, ChevronDown, ChevronRight, X,
  Wallet, CreditCard, AlertCircle, Search, TrendingDown
} from 'lucide-react';
import { toast } from 'sonner';

const CreditPage: React.FC = () => {
  const { sales, applyCreditPayment } = useSaleStore();
  const { payments } = usePaymentStore();
  const { customers, getCustomerById } = useCustomerStore();
  const { currentUser } = useAuthStore();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'clients' | 'sales' | 'payments'>('clients');
  const [search, setSearch] = useState('');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  // Modal d'encaissement
  const [paymentTarget, setPaymentTarget] = useState<Sale | null>(null);
  const [payForm, setPayForm] = useState({
    amount: '', channel: 'especes' as 'especes' | 'mobile_money',
    mobileOperator: 'mtn' as 'mtn' | 'orange', mobileReference: '', notes: '',
  });

  // ── Calculs ──────────────────────────────────────────────────────────────
  const openSales = useMemo(
    () => getAllOpenCreditSales(sales, payments),
    [sales, payments]
  );

  /** Statistiques par client (encours, nb ventes ouvertes, vente la plus ancienne). */
  const clientStats = useMemo(() => {
    const map = new Map<string, {
      customerId: string;
      customerName: string;
      outstanding: number;
      nbOpen: number;
      oldestSale: Sale | null;
    }>();

    openSales.forEach(s => {
      if (!s.customerId) return;
      const current = map.get(s.customerId) ?? {
        customerId: s.customerId,
        customerName: s.customerName ?? '(client inconnu)',
        outstanding: 0,
        nbOpen: 0,
        oldestSale: null,
      };
      current.outstanding += getRemainingBalance(s, payments);
      current.nbOpen += 1;
      if (!current.oldestSale || new Date(s.date) < new Date(current.oldestSale.date)) {
        current.oldestSale = s;
      }
      map.set(s.customerId, current);
    });

    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [openSales, payments]);

  const totalOutstanding = clientStats.reduce((sum, c) => sum + c.outstanding, 0);
  const totalReceivedToday = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return payments
      .filter(p => new Date(p.date) >= todayStart)
      .reduce((sum, p) => sum + getPaymentSignedAmount(p), 0);
  }, [payments]);

  // ── Filtres recherche ────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clientStats;
    const q = search.toLowerCase().trim();
    return clientStats.filter(c => c.customerName.toLowerCase().includes(q));
  }, [clientStats, search]);

  const filteredOpenSales = useMemo(() => {
    if (!search.trim()) return openSales;
    const q = search.toLowerCase().trim();
    return openSales.filter(s =>
      (s.customerName ?? '').toLowerCase().includes(q) ||
      s.saleNumber.toLowerCase().includes(q)
    );
  }, [openSales, search]);

  const filteredPayments = useMemo(() => {
    if (!search.trim()) return payments;
    const q = search.toLowerCase().trim();
    return payments.filter(p => {
      const customer = getCustomerById(p.customerId);
      const name = customer ? `${customer.prenom} ${customer.nom}` : '';
      return name.toLowerCase().includes(q);
    });
  }, [payments, search, getCustomerById]);

  // ── Ouverture du modal d'encaissement ────────────────────────────────────
  const openPayModal = (sale: Sale) => {
    setPaymentTarget(sale);
    const remaining = getRemainingBalance(sale, payments);
    setPayForm({
      amount: String(remaining),  // par défaut : solde restant complet
      channel: 'especes',
      mobileOperator: 'mtn',
      mobileReference: '',
      notes: '',
    });
  };

  const handleApplyPayment = () => {
    if (!paymentTarget || !currentUser) return;
    const amount = parseInt(payForm.amount, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('credit.invalidAmount'));
      return;
    }
    if (payForm.channel === 'mobile_money' && !payForm.mobileReference.trim()) {
      toast.error(t('credit.mobileRefRequired'));
      return;
    }
    try {
      applyCreditPayment(paymentTarget.id, {
        amount,
        channel: payForm.channel,
        mobileOperator: payForm.channel === 'mobile_money' ? payForm.mobileOperator : undefined,
        mobileReference: payForm.channel === 'mobile_money' ? payForm.mobileReference.trim() : undefined,
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
        notes: payForm.notes.trim() || undefined,
      });
      toast.success(t('credit.paymentSaved').replace('{n}', formatFCFA(amount)));
      setPaymentTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('credit.paymentError'));
    }
  };

  // ── Badge ancienneté ─────────────────────────────────────────────────────
  const AgeBadge: React.FC<{ sale: Sale }> = ({ sale }) => {
    const bucket = getCreditAgeBucket(sale);
    const days = getCreditAgeInDays(sale);
    const cls = bucket === 'recent' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : bucket === 'moderate' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              : 'bg-destructive/15 text-destructive border-destructive/30';
    return (
      <span className={cn('inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border', cls)}>
        {days}j
      </span>
    );
  };

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      <h1 className="text-2xl nova-heading text-foreground mb-6">{t('credit.title')}</h1>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-grid mb-6">
        <NovaCard accent>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('credit.kpiOutstanding')}</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatFCFA(totalOutstanding)}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('credit.kpiDebtors')}</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{clientStats.length}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('credit.kpiOpenSales')}</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{openSales.length}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/15 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('credit.kpiTodayReceived')}</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatFCFA(totalReceivedToday)}</p>
            </div>
          </div>
        </NovaCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('clients')}
          className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
            activeTab === 'clients' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
          <Users className="w-4 h-4" /> {t('credit.tabClients')}
        </button>
        <button onClick={() => setActiveTab('sales')}
          className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
            activeTab === 'sales' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
          <Receipt className="w-4 h-4" /> {t('credit.tabSales')}
        </button>
        <button onClick={() => setActiveTab('payments')}
          className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2',
            activeTab === 'payments' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
          <History className="w-4 h-4" /> {t('credit.tabPayments')}
        </button>
      </div>

      {/* Recherche */}
      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          className="nova-input w-full pl-10"
          placeholder={activeTab === 'payments' ? t('credit.searchPayments') : t('credit.searchOther')}
        />
      </div>

      {/* ── Onglet : Par client ───────────────────────────────────────────── */}
      {activeTab === 'clients' && (
        filteredClients.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="w-12 h-12" />}
            title={t('credit.noCreance')}
            description={t('credit.noCreanceDesc')}
          />
        ) : (
          <div className="space-y-3">
            {filteredClients.map(cs => {
              const customer = getCustomerById(cs.customerId);
              const isExpanded = expandedClient === cs.customerId;
              const openForClient = getCustomerOpenCreditSales(cs.customerId, sales, payments);
              const oldestDays = cs.oldestSale ? getCreditAgeInDays(cs.oldestSale) : 0;

              return (
                <NovaCard key={cs.customerId} accent className="!p-0 overflow-hidden">
                  <button
                    onClick={() => setExpandedClient(isExpanded ? null : cs.customerId)}
                    className="w-full flex items-center gap-grid p-4 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0"
                         style={{ backgroundColor: customer?.color ?? '#A93200' }}>
                      {cs.customerName.split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{cs.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {cs.nbOpen > 1
                          ? t('credit.openSalesPlural').replace('{n}', String(cs.nbOpen))
                          : t('credit.openSalesSingular').replace('{n}', String(cs.nbOpen))}
                        {oldestDays > 0 && ` ${t('credit.oldestLabel').replace('{n}', String(oldestDays))}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-base font-bold text-red-400 tabular-nums">{formatFCFA(cs.outstanding)}</p>
                      {customer?.plafondCredit !== undefined && (
                        <p className="text-[10px] text-muted-foreground">
                          / {formatFCFA(customer.plafondCredit)}
                        </p>
                      )}
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border p-3 space-y-2 bg-muted/10">
                      {openForClient.map(sale => {
                        const remaining = getRemainingBalance(sale, payments);
                        return (
                          <div key={sale.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">{sale.saleNumber}</p>
                                <AgeBadge sale={sale} />
                                {sale.creditStatus === 'partial' && (
                                  <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">{t('credit.partialBadge')}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                <span>{formatDateShort(new Date(sale.date))}</span>
                                {sale.dueDate && <span>{t('credit.dueDate').replace('{date}', new Date(sale.dueDate).toLocaleDateString(getCurrentBcp47()))}</span>}
                                {(sale.amountPaid ?? 0) > 0 && <span>{t('credit.saleAmountPaid').replace('{n}', formatFCFA(sale.amountPaid ?? 0))}</span>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-foreground tabular-nums">{formatFCFA(remaining)}</p>
                              <p className="text-[10px] text-muted-foreground">/ {formatFCFA(sale.total)}</p>
                            </div>
                            <button
                              onClick={() => openPayModal(sale)}
                              className="nova-btn-primary text-xs px-3 py-1.5 shrink-0"
                            >
                              {t('credit.collectBtn')}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </NovaCard>
              );
            })}
          </div>
        )
      )}

      {/* ── Onglet : Par vente ────────────────────────────────────────────── */}
      {activeTab === 'sales' && (
        filteredOpenSales.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-12 h-12" />}
            title={t('credit.noOpenSale')}
            description={t('credit.noOpenSaleDesc')}
          />
        ) : (
          <NovaCard accent className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">{t('credit.colNum')}</th>
                    <th className="text-left p-3">{t('credit.colDate')}</th>
                    <th className="text-left p-3">{t('credit.colClient')}</th>
                    <th className="text-right p-3">{t('credit.colTotal')}</th>
                    <th className="text-right p-3">{t('credit.colPaid')}</th>
                    <th className="text-right p-3">{t('credit.colRemaining')}</th>
                    <th className="text-center p-3">{t('credit.colStatus')}</th>
                    <th className="text-center p-3">{t('credit.colAge')}</th>
                    <th className="text-center p-3">{t('credit.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOpenSales.map(sale => {
                    const remaining = getRemainingBalance(sale, payments);
                    return (
                      <tr key={sale.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-sm text-foreground font-medium">{sale.saleNumber}</td>
                        <td className="p-3 text-sm text-muted-foreground">{formatDateShort(new Date(sale.date))}</td>
                        <td className="p-3 text-sm text-foreground truncate max-w-[180px]">{sale.customerName}</td>
                        <td className="p-3 text-sm text-right text-foreground tabular-nums">{formatFCFA(sale.total)}</td>
                        <td className="p-3 text-sm text-right text-secondary tabular-nums">{formatFCFA(sale.amountPaid ?? 0)}</td>
                        <td className="p-3 text-sm text-right text-red-400 font-medium tabular-nums">{formatFCFA(remaining)}</td>
                        <td className="p-3 text-center">
                          <span className={cn('text-[10px] px-2 py-0.5 rounded',
                            sale.creditStatus === 'partial' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
                          )}>
                            {sale.creditStatus === 'partial' ? t('credit.partialBadge') : t('credit.pendingBadge')}
                          </span>
                        </td>
                        <td className="p-3 text-center"><AgeBadge sale={sale} /></td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => openPayModal(sale)}
                            className="nova-btn-primary text-xs px-3 py-1"
                          >
                            {t('credit.collectBtn')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </NovaCard>
        )
      )}

      {/* ── Onglet : Règlements ───────────────────────────────────────────── */}
      {activeTab === 'payments' && (
        filteredPayments.length === 0 ? (
          <EmptyState
            icon={<History className="w-12 h-12" />}
            title={t('credit.noPayment')}
            description={t('credit.noPaymentDesc')}
          />
        ) : (
          <NovaCard accent className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">{t('credit.colDate')}</th>
                    <th className="text-left p-3">{t('credit.colClient')}</th>
                    <th className="text-left p-3">{t('credit.colSale')}</th>
                    <th className="text-right p-3">{t('credit.colTotal')}</th>
                    <th className="text-left p-3">{t('credit.colPayMode')}</th>
                    <th className="text-left p-3">{t('credit.colCashier')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map(p => {
                    const customer = getCustomerById(p.customerId);
                    const sale = sales.find(s => s.id === p.saleId);
                    return (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-sm text-muted-foreground">{formatDateShort(new Date(p.date))}</td>
                        <td className="p-3 text-sm text-foreground">
                          {customer ? `${customer.prenom} ${customer.nom}` : t('credit.deletedClient')}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{sale?.saleNumber ?? '—'}</td>
                        <td className="p-3 text-sm text-right text-secondary font-medium tabular-nums">{formatFCFA(getPaymentSignedAmount(p))}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {p.channel === 'especes' ? t('credit.cashChannel') : `📱 ${p.mobileOperator?.toUpperCase() ?? 'Mobile'}`}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{p.userName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </NovaCard>
        )
      )}

      {/* ── Modal : Encaisser un règlement ─────────────────────────────────── */}
      {paymentTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPaymentTarget(null)}
        >
          <div
            className="nova-card w-full max-w-[460px] p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="nova-heading text-lg text-foreground">{t('credit.collectModalTitle')}</h3>
              <button onClick={() => setPaymentTarget(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Récap */}
            <div className="p-3 rounded-lg bg-muted/40 space-y-1 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('credit.recapSale')}</span>
                <span className="text-foreground font-medium">{paymentTarget.saleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('credit.recapClient')}</span>
                <span className="text-foreground">{paymentTarget.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('credit.recapTotal')}</span>
                <span className="text-foreground tabular-nums">{formatFCFA(paymentTarget.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('credit.recapPaid')}</span>
                <span className="text-secondary tabular-nums">{formatFCFA(paymentTarget.amountPaid ?? 0)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border">
                <span className="text-foreground font-semibold">{t('credit.recapRemaining')}</span>
                <span className="text-red-400 font-bold tabular-nums">
                  {formatFCFA(getRemainingBalance(paymentTarget, payments))}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('credit.labelAmount')}</label>
                <input
                  type="number" value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                  className="nova-input w-full py-2"
                  autoFocus
                  min="1"
                  max={getRemainingBalance(paymentTarget, payments)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('credit.maxAmount').replace('{n}', formatFCFA(getRemainingBalance(paymentTarget, payments)))}
                </p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('credit.labelPayMode')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPayForm({ ...payForm, channel: 'especes' })}
                    className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                      payForm.channel === 'especes' ? 'bg-primary/15 border-primary text-primary' : 'bg-muted border-border text-muted-foreground')}
                  >
                    {t('credit.cashChannel')}
                  </button>
                  <button
                    onClick={() => setPayForm({ ...payForm, channel: 'mobile_money' })}
                    className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                      payForm.channel === 'mobile_money' ? 'bg-primary/15 border-primary text-primary' : 'bg-muted border-border text-muted-foreground')}
                  >
                    {t('credit.mobileChannel')}
                  </button>
                </div>
              </div>

              {payForm.channel === 'mobile_money' && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('credit.labelOperator')}</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPayForm({ ...payForm, mobileOperator: 'mtn' })}
                        className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                          payForm.mobileOperator === 'mtn' ? 'bg-amber-500/15 border-amber-500 text-amber-400' : 'bg-muted border-border text-muted-foreground')}
                      >
                        MTN MoMo
                      </button>
                      <button
                        onClick={() => setPayForm({ ...payForm, mobileOperator: 'orange' })}
                        className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                          payForm.mobileOperator === 'orange' ? 'bg-orange-500/15 border-orange-500 text-orange-400' : 'bg-muted border-border text-muted-foreground')}
                      >
                        Orange Money
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('credit.labelReference')}</label>
                    <input
                      type="text" value={payForm.mobileReference}
                      onChange={e => setPayForm({ ...payForm, mobileReference: e.target.value })}
                      className="nova-input w-full py-2"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('credit.labelNotes')}</label>
                <textarea
                  value={payForm.notes}
                  onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                  className="nova-input w-full h-16 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-grid mt-5">
              <button
                onClick={() => setPaymentTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                {t('credit.cancel')}
              </button>
              <button onClick={handleApplyPayment} className="flex-1 nova-btn-primary py-2.5">
                {t('credit.validate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditPage;
