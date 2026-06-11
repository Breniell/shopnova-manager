/**
 * DepensesPage — gestion des dépenses opérationnelles.
 *
 * Fonctionnalités :
 *   • Filtre par période (aujourd'hui / semaine / mois / tout)
 *   • 4 KPI : total, plus grosse catégorie, nb dépenses, vs période précédente
 *   • Camembert répartition par catégorie
 *   • Tableau filtrable / triable
 *   • Modal d'ajout / édition
 *   • Export CSV
 *
 * Permissions : GÉRANT UNIQUEMENT (route protégée dans App.tsx).
 */
import React, { useState, useMemo } from 'react';
import {
  useExpenseStore, type Expense, type ExpenseCategory, type ExpensePaymentMode,
  EXPENSE_CATEGORIES, PAYMENT_MODE_LABELS, getCategoryMeta,
} from '@/stores/useExpenseStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatFCFA, formatDateShort } from '@/utils/formatters';
import { exportCSV } from '@/lib/export';
import { expenseSchema } from '@/lib/validations';
import { cn } from '@/lib/utils';
import {
  Plus, Edit, Trash2, X, Search, Download,
  TrendingDown, BarChart3, Calendar, FileText
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';

type Period = 'today' | 'week' | 'month' | 'all';

interface FormState {
  date: string;
  categorie: ExpenseCategory;
  description: string;
  montant: string;
  paymentMode: ExpensePaymentMode;
  beneficiaire: string;
  reference: string;
  notes: string;
}

const emptyForm: FormState = {
  date: new Date().toISOString().slice(0, 10),
  categorie: 'autre',
  description: '',
  montant: '',
  paymentMode: 'especes',
  beneficiaire: '',
  reference: '',
  notes: '',
};

const DepensesPage: React.FC = () => {
  const { t } = useTranslation();
  const { expenses, addExpense, updateExpense, deleteExpense } = useExpenseStore();
  const { currentUser } = useAuthStore();
  const { getCurrentSession, addCashOut } = useCashSessionStore();

  const [period, setPeriod] = useState<Period>('month');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const now = new Date();
  const { periodStart, previousPeriodStart, previousPeriodEnd } = useMemo(() => {
    const start = new Date(now);
    let prevStart = new Date(now);
    let prevEnd = new Date(now);

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(start);
    } else if (period === 'week') {
      start.setDate(start.getDate() - 7);
      prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
      prevEnd = new Date(start);
    } else if (period === 'month') {
      start.setMonth(start.getMonth() - 1);
      prevStart = new Date(start); prevStart.setMonth(prevStart.getMonth() - 1);
      prevEnd = new Date(start);
    } else {
      start.setFullYear(1970);
      prevStart = new Date(1970, 0, 1);
      prevEnd = new Date(1970, 0, 1);
    }

    return { periodStart: start, previousPeriodStart: prevStart, previousPeriodEnd: prevEnd };
  }, [period]);

  const periodExpenses = useMemo(
    () => expenses.filter(e => new Date(e.date) >= periodStart && new Date(e.date) <= now),
    [expenses, periodStart, now]
  );

  const totalPeriod = periodExpenses.reduce((sum, e) => sum + e.montant, 0);
  const previousTotal = useMemo(() => {
    if (period === 'all') return 0;
    return expenses
      .filter(e => {
        const d = new Date(e.date);
        return d >= previousPeriodStart && d < previousPeriodEnd;
      })
      .reduce((sum, e) => sum + e.montant, 0);
  }, [expenses, previousPeriodStart, previousPeriodEnd, period]);

  const trend = previousTotal > 0
    ? Math.round(((totalPeriod - previousTotal) / previousTotal) * 100)
    : (totalPeriod > 0 ? 100 : 0);

  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    periodExpenses.forEach(e => {
      map.set(e.categorie, (map.get(e.categorie) ?? 0) + e.montant);
    });
    return Array.from(map.entries())
      .map(([cat, total]) => {
        const meta = getCategoryMeta(cat);
        return { categorie: cat, label: meta.label, color: meta.color, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [periodExpenses]);

  const topCategory = byCategory[0] ?? null;

  const filteredExpenses = useMemo(() => {
    let list = periodExpenses;
    if (categoryFilter !== 'all') {
      list = list.filter(e => e.categorie === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(e =>
        e.description.toLowerCase().includes(q) ||
        (e.beneficiaire?.toLowerCase().includes(q) ?? false) ||
        (e.reference?.toLowerCase().includes(q) ?? false)
      );
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [periodExpenses, categoryFilter, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (exp: Expense) => {
    setEditing(exp);
    setForm({
      date: new Date(exp.date).toISOString().slice(0, 10),
      categorie: exp.categorie,
      description: exp.description,
      montant: String(exp.montant),
      paymentMode: exp.paymentMode,
      beneficiaire: exp.beneficiaire ?? '',
      reference: exp.reference ?? '',
      notes: exp.notes ?? '',
    });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!currentUser) return;

    const montant = Number(form.montant);
    const result = expenseSchema.safeParse({
      categorie: form.categorie,
      description: form.description.trim(),
      montant,
      paymentMode: form.paymentMode,
      beneficiaire: form.beneficiaire.trim() || undefined,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
    });

    if (!result.success) {
      const firstError = result.error.issues[0];
      toast.error(firstError?.message ?? t('depenses.validationFailed'));
      return;
    }

    const data = {
      categorie: form.categorie,
      description: form.description.trim(),
      montant,
      paymentMode: form.paymentMode,
      beneficiaire: form.beneficiaire.trim() || undefined,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
      date: new Date(form.date),
      userId: currentUser.id,
      userName: `${currentUser.prenom} ${currentUser.nom}`,
    };

    try {
      if (editing) {
        updateExpense(editing.id, data);
        toast.success(t('depenses.updated'));
      } else {
        const expense = addExpense(data);
        toast.success(t('depenses.saved'));

        if (expense.paymentMode === 'especes') {
          const session = getCurrentSession();
          if (session) {
            try {
              addCashOut({
                cashSessionId: session.id,
                date: expense.date,
                type: 'depense_caisse',
                amount: expense.montant,
                beneficiaire: expense.beneficiaire,
                motif: expense.description,
                relatedExpenseId: expense.id,
                userId: expense.userId,
                userName: expense.userName,
              });
              toast.info(t('depenses.cashOutRecorded').replace('{n}', expense.montant.toLocaleString('fr-FR')));
            } catch (err) {
              console.warn('Échec de la création du CashOut lié à la dépense:', err);
            }
          }
        }
      }
      setShowModal(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteExpense(deleteTarget.id);
    toast.success(t('depenses.deleted'));
    setDeleteTarget(null);
  };

  const handleExport = () => {
    if (filteredExpenses.length === 0) {
      toast.error(t('depenses.nothingToExport'));
      return;
    }
    const headers = [
      t('depenses.csvColDate'), t('depenses.csvColCategory'), t('depenses.csvColDescription'),
      t('depenses.csvColBeneficiary'), t('depenses.csvColReference'), t('depenses.csvColPayment'),
      t('depenses.csvColAmount'), t('depenses.csvColUser'), t('depenses.csvColNotes'),
    ];
    const rows = filteredExpenses.map(e => [
      formatDateShort(new Date(e.date)),
      getCategoryMeta(e.categorie).label,
      e.description,
      e.beneficiaire ?? '',
      e.reference ?? '',
      PAYMENT_MODE_LABELS[e.paymentMode],
      String(e.montant),
      e.userName,
      e.notes ?? '',
    ]);
    exportCSV(`depenses-${new Date().toISOString().slice(0, 10)}`, headers, rows);
    toast.success(t('depenses.csvExported'));
  };

  const periodLabels: Record<Period, string> = {
    today: t('depenses.periodToday'),
    week:  t('depenses.periodWeek'),
    month: t('depenses.periodMonth'),
    all:   t('depenses.periodAll'),
  };

  const periodLabel = periodLabels[period];

  const periodBtnLabels: Record<Period, string> = {
    today: t('depenses.btnToday'),
    week:  t('depenses.btnWeek'),
    month: t('depenses.btnMonth'),
    all:   t('depenses.btnAll'),
  };

  const n = filteredExpenses.length;
  const totalFooter = (n > 1 ? t('depenses.totalFooterPlural') : t('depenses.totalFooter')).replace('{n}', String(n));

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-grid">
        <h1 className="text-headline-lg nova-heading text-foreground">{t('depenses.title')}</h1>
        <div className="flex flex-wrap items-center gap-grid">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  period === p ? 'bg-card text-foreground' : 'text-muted-foreground'
                )}
              >
                {periodBtnLabels[p]}
              </button>
            ))}
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors text-sm"
            title={t('depenses.exportTitle')}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{t('depenses.exportBtn')}</span>
          </button>
          <button onClick={openAdd} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5">
            <Plus className="w-4 h-4" /> {t('depenses.addBtn')}
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-grid mb-6">
        <NovaCard accent>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('depenses.totalPeriod').replace('{period}', periodLabel)}</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatFCFA(totalPeriod)}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('depenses.biggestCategory')}</p>
              <p className="text-sm font-bold text-foreground truncate">
                {topCategory ? topCategory.label : '—'}
              </p>
              {topCategory && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {formatFCFA(topCategory.total)}
                </p>
              )}
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('depenses.expenseCount')}</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{periodExpenses.length}</p>
            </div>
          </div>
        </NovaCard>
        <NovaCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Calendar className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('depenses.vsPrev')}</p>
              {period === 'all' ? (
                <p className="text-sm font-bold text-muted-foreground">—</p>
              ) : (
                <p className={cn(
                  'text-base font-bold tabular-nums',
                  trend > 0 ? 'text-destructive' : trend < 0 ? 'text-emerald-400' : 'text-muted-foreground'
                )}>
                  {trend > 0 ? '+' : ''}{trend}%
                </p>
              )}
            </div>
          </div>
        </NovaCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Camembert */}
        <NovaCard accent title={t('depenses.byCategory')} className="lg:col-span-2">
          {byCategory.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t('depenses.noExpenseChart')}</p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="total"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ percent }) =>
                      percent && percent > 0.08 ? `${Math.round(percent * 100)}%` : ''
                    }
                  >
                    {byCategory.map(c => (
                      <Cell key={c.categorie} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, _name, props) =>
                      [formatFCFA(value), props.payload.label]
                    }
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </NovaCard>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row gap-grid">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="nova-input w-full pl-10"
                placeholder={t('depenses.searchPlaceholder')}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as 'all' | ExpenseCategory)}
              className="nova-input min-w-[180px]"
            >
              <option value="all">{t('depenses.allCategories')}</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <NovaCard accent>
            {filteredExpenses.length === 0 ? (
              <EmptyState
                icon={<TrendingDown className="w-12 h-12" />}
                title={t('depenses.noExpense')}
                description={
                  search || categoryFilter !== 'all'
                    ? t('depenses.noResult')
                    : t('depenses.noExpenseDesc')
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="nova-table-header">
                      <th className="text-left p-3 text-xs">{t('depenses.colDate')}</th>
                      <th className="text-left p-3 text-xs">{t('depenses.colCategory')}</th>
                      <th className="text-left p-3 text-xs">{t('depenses.colDescription')}</th>
                      <th className="text-right p-3 text-xs">{t('depenses.colAmount')}</th>
                      <th className="text-left p-3 text-xs hidden md:table-cell">{t('depenses.colMode')}</th>
                      <th className="text-right p-3 text-xs">{t('depenses.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map(e => {
                      const meta = getCategoryMeta(e.categorie);
                      return (
                        <tr key={e.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateShort(new Date(e.date))}
                          </td>
                          <td className="p-3">
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium border"
                              style={{
                                backgroundColor: `${meta.color}20`,
                                color: meta.color,
                                borderColor: `${meta.color}50`,
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="p-3 text-sm text-foreground max-w-xs">
                            <p className="truncate">{e.description}</p>
                            {e.beneficiaire && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {e.beneficiaire}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-sm text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                            {formatFCFA(e.montant)}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">
                            {PAYMENT_MODE_LABELS[e.paymentMode]}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => openEdit(e)}
                                aria-label={t('depenses.save')}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(e)}
                                aria-label={t('depenses.delete')}
                                className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                      <td colSpan={3} className="p-3 text-sm font-semibold text-foreground">
                        {totalFooter}
                      </td>
                      <td className="p-3 text-base text-right font-bold text-foreground tabular-nums">
                        {formatFCFA(filteredExpenses.reduce((s, e) => s + e.montant, 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </NovaCard>

          <p className="text-[11px] text-muted-foreground italic px-1">
            {t('depenses.cashSessionNote')}
          </p>
        </div>
      </div>

      {/* ── Modal Ajout / Édition ── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="nova-card w-full max-w-[520px] p-6 animate-scale-in max-h-[90vh] overflow-y-auto"
            onClick={ev => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">
                {editing ? t('depenses.editTitle') : t('depenses.addTitle')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-muted">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelDate')}</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={ev => setForm({ ...form, date: ev.target.value })}
                    className="nova-input w-full py-2"
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelCategory')}</label>
                  <select
                    value={form.categorie}
                    onChange={ev => setForm({ ...form, categorie: ev.target.value as ExpenseCategory })}
                    className="nova-input w-full py-2"
                  >
                    {EXPENSE_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelDescription')}</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={ev => setForm({ ...form, description: ev.target.value })}
                  className="nova-input w-full py-2"
                  placeholder="Ex : Facture Eneo mars 2026"
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelAmount')}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.montant}
                    onChange={ev => setForm({ ...form, montant: ev.target.value })}
                    className="nova-input w-full py-2"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelPaymentMode')}</label>
                  <select
                    value={form.paymentMode}
                    onChange={ev => setForm({ ...form, paymentMode: ev.target.value as ExpensePaymentMode })}
                    className="nova-input w-full py-2"
                  >
                    {(Object.keys(PAYMENT_MODE_LABELS) as ExpensePaymentMode[]).map(m => (
                      <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelBeneficiary')}</label>
                <input
                  type="text"
                  value={form.beneficiaire}
                  onChange={ev => setForm({ ...form, beneficiaire: ev.target.value })}
                  className="nova-input w-full py-2"
                  placeholder="Ex : Eneo, Bailleur, MTN..."
                  maxLength={100}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelReference')}</label>
                <input
                  type="text"
                  value={form.reference}
                  onChange={ev => setForm({ ...form, reference: ev.target.value })}
                  className="nova-input w-full py-2"
                  placeholder={t('depenses.referencePlaceholder')}
                  maxLength={50}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('depenses.labelNotes')}</label>
                <textarea
                  value={form.notes}
                  onChange={ev => setForm({ ...form, notes: ev.target.value })}
                  className="nova-input w-full h-16 resize-none"
                  maxLength={500}
                />
              </div>
            </div>
            <div className="flex gap-grid mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                {t('depenses.cancel')}
              </button>
              <button onClick={handleSubmit} className="flex-1 nova-btn-primary py-2.5">
                {editing ? t('depenses.save') : t('depenses.add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Suppression ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="nova-card p-6 w-full max-w-[400px] animate-scale-in"
            onClick={ev => ev.stopPropagation()}
          >
            <h3 className="nova-heading text-lg text-foreground mb-2">{t('depenses.deleteTitle')}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              <strong className="text-foreground">{deleteTarget.description}</strong>
              <br />
              {formatFCFA(deleteTarget.montant)} — {formatDateShort(new Date(deleteTarget.date))}
              <br />
              {t('depenses.deleteIrreversible')}
            </p>
            <div className="flex gap-grid">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                {t('depenses.cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                {t('depenses.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepensesPage;
