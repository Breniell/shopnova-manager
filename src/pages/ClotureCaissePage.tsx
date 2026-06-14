import React, { useState, useMemo } from 'react';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCaisseStore } from '@/stores/useCaisseStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePaymentStore } from '@/stores/usePaymentStore';
import { useCashSessionStore, CASHOUT_TYPE_LABELS } from '@/stores/useCashSessionStore';
import { CashOutModal } from '@/components/ui/CashOutModal';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { Calculator, Check, DollarSign, Smartphone, History, AlertTriangle, Wallet, Edit2, Receipt, Plus, Clock, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { formatPrice, formatFCFA, formatDate, formatTime, formatDateShort } from '@/utils/formatters';
import { useTranslation } from '@/i18n';

const denominations = [
  { label: '10 000', value: 10000, type: 'billet' },
  { label: '5 000', value: 5000, type: 'billet' },
  { label: '2 000', value: 2000, type: 'billet' },
  { label: '1 000', value: 1000, type: 'billet' },
  { label: '500', value: 500, type: 'billet' },
  { label: '100', value: 100, type: 'piece' },
  { label: '50', value: 50, type: 'piece' },
  { label: '25', value: 25, type: 'piece' },
  { label: '10', value: 10, type: 'piece' },
  { label: '5', value: 5, type: 'piece' },
];

const ClotureCaissePage: React.FC = () => {
  const { t } = useTranslation();
  const { sales } = useSaleStore();
  const { clotures, fondDeCaisse, addCloture, setFondDeCaisse } = useCaisseStore();
  const { currentUser } = useAuthStore();
  const { payments } = usePaymentStore();
  const { getCurrentSession, getSessionCashOuts, closeSession } = useCashSessionStore();
  const [activeTab, setActiveTab] = useState<'cloture' | 'historique'>('cloture');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [editingFond, setEditingFond] = useState(false);
  const [fondInput, setFondInput] = useState(String(fondDeCaisse));
  const [showCashOutModal, setShowCashOutModal] = useState(false);

  const isGerant = currentUser?.role === 'gérant';

  // ── Mode "session" ou mode "journalier" (legacy) ────────────────────────
  // Si l'utilisateur a une session active, on calcule sur la session.
  // Sinon on garde le mode journalier (pour la rétro-compat avec les anciennes
  // ventes sans cashSessionId, et pour les gérants en mode back-office).
  const currentSession = getCurrentSession();
  const inSessionMode = currentSession !== null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Bornes temporelles pour les calculs :
  // - session mode : depuis l'ouverture de la session
  // - legacy mode  : depuis minuit aujourd'hui
  const periodStart = inSessionMode && currentSession
    ? new Date(currentSession.openedAt)
    : today;

  // ── Ventes incluses dans la période ─────────────────────────────────────
  const periodSales = useMemo(() => {
    return sales.filter(s => {
      if (s.status === 'refunded') return false;
      if (inSessionMode && currentSession) {
        // En mode session, on filtre par cashSessionId. Ne pas se baser sur la
        // date seule : si une vente legacy traîne dans la période, on l'exclut.
        return s.cashSessionId === currentSession.id;
      }
      return new Date(s.date) >= periodStart;
    });
  }, [sales, inSessionMode, currentSession, periodStart]);

  // ── Règlements de crédit dans la période ────────────────────────────────
  const periodPayments = useMemo(() => {
    return payments.filter(p => {
      if (inSessionMode && currentSession) {
        return p.cashSessionId === currentSession.id;
      }
      return new Date(p.date) >= periodStart;
    });
  }, [payments, inSessionMode, currentSession, periodStart]);

  // ── Sorties de caisse dans la session (mode session uniquement) ─────────
  const sessionCashOuts = useMemo(() => {
    if (!currentSession) return [];
    return getSessionCashOuts(currentSession.id);
  }, [currentSession, getSessionCashOuts]);

  const totalCashOuts = sessionCashOuts.reduce((sum, c) => sum + c.amount, 0);

  // ── Ventes à crédit (information seule, n'entrent PAS dans l'attendu) ──
  const periodCreditSales = useMemo(
    () => periodSales.filter(s => s.paymentMode === 'credit'),
    [periodSales]
  );
  const totalCreditPeriod = periodCreditSales.reduce((sum, s) => sum + s.total, 0);

  // ── Espèces ─────────────────────────────────────────────────────────────
  const totalEspecesVentes = periodSales
    .filter(s => s.paymentMode === 'especes')
    .reduce((sum, s) => sum + s.total, 0);
  const totalEspecesReglements = periodPayments
    .filter(p => p.channel === 'especes')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalEspeces = totalEspecesVentes + totalEspecesReglements;

  // ── Mobile money ────────────────────────────────────────────────────────
  const totalMobileVentes = periodSales
    .filter(s => s.paymentMode === 'mobile_money')
    .reduce((sum, s) => sum + s.total, 0);
  const totalMobileReglements = periodPayments
    .filter(p => p.channel === 'mobile_money')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalMobile = totalMobileVentes + totalMobileReglements;

  // CA encaissé = espèces + mobile money (ne contient PAS les crédits non réglés)
  const caEncaisse = totalEspeces + totalMobile;

  // ── Fond de référence ─────────────────────────────────────────────────────
  // En mode session, on utilise le fondInitial déclaré à l'ouverture.
  // En mode legacy, on utilise le fondDeCaisse global (persistant côté Caisse store).
  const fondReference = inSessionMode && currentSession
    ? currentSession.fondInitial
    : fondDeCaisse;

  // Solde journalier = CA encaissé + fond (valeur totale gérée)
  const soldeJournalier = caEncaisse + fondReference;

  // ── Montant attendu physiquement dans le tiroir ──────────────────────────
  // = fond + espèces entrées - sorties de caisse de la session
  // En mode legacy, totalCashOuts = 0 (pas de sorties associées).
  const totalAttenduPhysique = totalEspeces + fondReference - totalCashOuts;

  const totalCompte = useMemo(() => {
    return denominations.reduce((sum, d) => {
      const qty = parseInt(counts[d.value] || '0', 10) || 0;
      return sum + qty * d.value;
    }, 0);
  }, [counts]);

  const ecart = totalCompte - totalAttenduPhysique;

  const handleCountChange = (denomination: number, value: string) => {
    setCounts(prev => ({ ...prev, [denomination]: value }));
  };

  const handleSaveFond = () => {
    const val = parseInt(fondInput);
    if (isNaN(val) || val < 0) {
      toast.error(t('cloture.invalidAmount'));
      return;
    }
    setFondDeCaisse(val);
    setEditingFond(false);
    toast.success(t('cloture.fundUpdated'));
  };

  const handleValidate = () => {
    if (!currentUser) return;
    if (totalCompte === 0) {
      toast.error(t('cloture.countFirst'));
      return;
    }

    const details: Record<string, number> = {};
    denominations.forEach(d => {
      const qty = parseInt(counts[d.value] || '0', 10) || 0;
      if (qty > 0) details[String(d.value)] = qty;
    });

    // Mode session : on ferme la session de caisse en plus de l'enregistrement
    // de cloture (qui sert d'historique consolidé pour la page Historique).
    if (inSessionMode && currentSession) {
      try {
        closeSession(currentSession.id, {
          totalCompte,
          details,
          ecart,
          notesCloture: notes || undefined,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('cloture.sessionError'));
        return;
      }
    }

    addCloture({
      date: new Date().toISOString(),
      userId: currentUser.id,
      userName: `${currentUser.prenom} ${currentUser.nom}`,
      totalVentesEspeces: totalEspeces,
      totalVentesMobile: totalMobile,
      totalAttendu: totalAttenduPhysique,
      totalCompte,
      ecart,
      details,
      notes: notes || undefined,
    });

    setIsDone(true);
    toast.success(inSessionMode ? t('cloture.sessionClosed') : t('cloture.closeValidated'));
    setTimeout(() => {
      setIsDone(false);
      setCounts({});
      setNotes('');
    }, 2000);
  };

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      <h1 className="text-2xl nova-heading text-foreground mb-6">{t('cloture.title')}</h1>

      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('cloture')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'cloture' ? 'bg-card text-foreground ' : 'text-muted-foreground')}>
          <Calculator className="w-4 h-4" /> {t('cloture.tabCloture')}
        </button>
        <button onClick={() => setActiveTab('historique')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'historique' ? 'bg-card text-foreground ' : 'text-muted-foreground')}>
          <History className="w-4 h-4" /> {t('cloture.tabHistory')}
        </button>
      </div>

      {activeTab === 'cloture' && (
        <>
          {/* KPIs — row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard icon={<DollarSign className="w-4 h-4 text-primary" />} iconBg="bg-primary/20" value={formatFCFA(totalEspeces)} label={t('cloture.cashSales')} />
            <StatCard icon={<Smartphone className="w-4 h-4 text-secondary" />} iconBg="bg-secondary/20" value={formatFCFA(totalMobile)} label={t('cloture.mobileSales')} />
            <StatCard
              icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
              iconBg="bg-emerald-500/20"
              value={formatFCFA(caEncaisse)}
              label={t('cloture.collectedRevenue')}
            />
            {/* Fond de caisse — éditable par le gérant */}
            <div className="nova-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 text-amber-400" />
                  </span>
                  <span className="text-xs text-muted-foreground leading-tight">{t('cloture.cashFund')}</span>
                </div>
                {isGerant && !editingFond && (
                  <button
                    onClick={() => { setFondInput(String(fondDeCaisse)); setEditingFond(true); }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={t('cloture.editFund')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {editingFond ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min="0"
                    value={fondInput}
                    onChange={e => setFondInput(e.target.value)}
                    className="nova-input py-1 px-2 text-sm w-full"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveFond(); if (e.key === 'Escape') setEditingFond(false); }}
                  />
                  <button onClick={handleSaveFond} className="nova-btn-primary px-2 py-1 text-xs rounded-lg shrink-0">OK</button>
                </div>
              ) : (
                <span className="text-xl font-bold text-foreground tabular-nums">{formatFCFA(fondDeCaisse)}</span>
              )}
            </div>
          </div>

          {/* KPI — Solde journalier (full width highlight) */}
          <div className="mb-3 p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('cloture.dailyBalance')}</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{t('cloture.dailyBalanceHint')}</p>
            </div>
            <span className="text-2xl font-bold text-primary tabular-nums">{formatFCFA(soldeJournalier)}</span>
          </div>

          {/* Info ventes à crédit du jour (n'entrent pas dans la caisse) */}
          {periodCreditSales.length > 0 && (
            <div className="mb-6 p-3 rounded-xl border border-red-500/30 bg-red-500/5 flex items-center gap-3">
              <Receipt className="w-4 h-4 text-red-400 shrink-0" />
              <div className="flex-1 text-xs">
                <p className="text-red-400 font-medium">
                  {t('cloture.creditSalesNote').replace('{n}', String(periodCreditSales.length)).replace('{amount}', formatFCFA(totalCreditPeriod))}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {t('cloture.creditSalesDesc')}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Comptage */}
            <NovaCard accent title={t('cloture.physicalCount')} className="lg:col-span-3">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-4">{t('cloture.countHint')}</p>
                <div className="grid grid-cols-2 gap-grid">
                  {denominations.map(d => (
                    <div key={d.value} className="flex items-center gap-grid p-2 rounded-lg bg-muted/30">
                      <span className={cn('text-sm font-medium w-20', d.type === 'billet' ? 'text-emerald-400' : 'text-amber-400')}>
                        {d.label} F
                      </span>
                      <span className="text-xs text-muted-foreground">×</span>
                      <input
                        type="number"
                        min="0"
                        value={counts[d.value] || ''}
                        onChange={e => handleCountChange(d.value, e.target.value)}
                        className="nova-input w-20 py-1 px-2 text-center text-sm"
                        placeholder="0"
                      />
                      <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                        = {formatFCFA((parseInt(counts[d.value] || '0', 10) || 0) * d.value)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <label className="text-xs text-muted-foreground mb-1 block">{t('cloture.notesLabel')}</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} className="nova-input w-full h-16 resize-none" placeholder={t('cloture.observations')} />
                </div>
              </div>
            </NovaCard>

            {/* Résultat */}
            <NovaCard accent title={t('cloture.result')} className="lg:col-span-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('cloture.counted')}</span>
                    <span className="text-foreground font-medium tabular-nums">{formatFCFA(totalCompte)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('cloture.expected')}</span>
                    <span className="text-foreground font-medium tabular-nums">{formatFCFA(totalAttenduPhysique)}</span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-foreground">{t('cloture.gap')}</span>
                      <span className={cn(
                        'money text-2xl',
                        ecart === 0 ? 'text-emerald-400' : ecart > 0 ? 'text-amber-400' : 'text-destructive'
                      )}>
                        {ecart >= 0 ? '+' : ''}{formatFCFA(ecart)}
                      </span>
                    </div>
                    <p className={cn('text-sm mt-1', ecart === 0 ? 'text-emerald-400' : ecart > 0 ? 'text-amber-400' : 'text-destructive')}>
                      {ecart === 0 ? `✓ ${t('cloture.exact')}` : ecart > 0 ? `⚠ ${t('cloture.surplus')}` : `⚠ ${t('cloture.deficit')}`}
                    </p>
                  </div>
                </div>

                {ecart < -500 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-xs text-destructive">{t('cloture.largeGapWarning')}</p>
                  </div>
                )}

                <div className="pt-4 space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {(periodSales.length > 1
                      ? t('cloture.salesCountPlural')
                      : t('cloture.salesCount')
                    ).replace('{n}', String(periodSales.length))}
                    {' • '}{t('cloture.cashierLabel')} : {currentUser?.prenom} {currentUser?.nom}
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={isDone}
                    className={cn(
                      'w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
                      isDone ? 'bg-secondary text-secondary-foreground' : 'nova-btn-primary'
                    )}
                  >
                    {isDone ? <><Check className="w-4 h-4" /> {t('cloture.recorded')}</> : t('cloture.validate')}
                  </button>
                </div>
              </div>
            </NovaCard>
          </div>
        </>
      )}

      {activeTab === 'historique' && (
        <NovaCard accent>
          {clotures.length === 0 ? (
            <EmptyState icon={<History className="w-12 h-12" />} title={t('cloture.noHistory')} description={t('cloture.noHistoryDesc')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="nova-table-header">
                    <th className="text-left p-3">{t('cloture.colDate')}</th>
                    <th className="text-left p-3">{t('cloture.colCashier')}</th>
                    <th className="text-right p-3">{t('cloture.colCash')}</th>
                    <th className="text-right p-3">{t('cloture.colMobile')}</th>
                    <th className="text-right p-3">{t('cloture.colRevenue')}</th>
                    <th className="text-right p-3">{t('cloture.colCounted')}</th>
                    <th className="text-right p-3">{t('cloture.colGap')}</th>
                  </tr>
                </thead>
                <tbody>
                  {clotures.map(c => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 text-sm text-muted-foreground">{formatDateShort(new Date(c.date))} {formatTime(new Date(c.date))}</td>
                      <td className="p-3 text-sm text-foreground">{c.userName}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums">{formatFCFA(c.totalVentesEspeces)}</td>
                      <td className="p-3 text-sm text-right text-foreground tabular-nums">{formatFCFA(c.totalVentesMobile)}</td>
                      <td className="p-3 text-sm text-right font-medium text-foreground tabular-nums">{formatFCFA(c.totalVentesEspeces + c.totalVentesMobile)}</td>
                      <td className="p-3 text-sm text-right font-medium text-foreground tabular-nums">{formatFCFA(c.totalCompte)}</td>
                      <td className={cn('p-3 text-sm text-right font-medium tabular-nums', c.ecart === 0 ? 'text-emerald-400' : c.ecart > 0 ? 'text-amber-400' : 'text-destructive')}>
                        {c.ecart >= 0 ? '+' : ''}{formatFCFA(c.ecart)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NovaCard>
      )}
    </div>
  );
};

export default ClotureCaissePage;
