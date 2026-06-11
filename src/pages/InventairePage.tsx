/**
 * InventairePage — gestion des sessions d'inventaire et réconciliation.
 *
 * UX en 3 onglets :
 *   • "Nouvelle session" : choix du périmètre + création
 *   • "Saisie" : tableau des lignes à compter (uniquement si une session active)
 *   • "Historique" : sessions validées (drawer avec détails)
 *
 * Permissions : GÉRANT UNIQUEMENT (route protégée).
 */
import React, { useState, useMemo } from 'react';
import {
  useInventoryStore,
  type InventoryScope,
  type InventorySession,
  type InventoryLine,
} from '@/stores/useInventoryStore';
import {
  useStockStore,
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentReason,
} from '@/stores/useStockStore';
import { useProductStore } from '@/stores/useProductStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { formatFCFA, formatDateShort, formatTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import {
  ClipboardList, Plus, X, Check, AlertTriangle, ArrowRight, Save,
  History, Filter, Trash2, Eye, FileX,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';

type Tab = 'new' | 'edit' | 'history';

const REASONS: AdjustmentReason[] = [
  'avarie', 'casse', 'vol', 'peremption',
  'erreur_saisie', 'consommation_interne', 'cadeau_don', 'non_identifie',
];

const InventairePage: React.FC = () => {
  const { t } = useTranslation();
  const { sessions, createSession, updateLine, validateSession, cancelSession, updateNotes } = useInventoryStore();
  const { products, categories, updateStock } = useProductStore();
  const { addMovement } = useStockStore();
  const { currentUser } = useAuthStore();

  const [tab, setTab] = useState<Tab>('new');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [viewedSession, setViewedSession] = useState<InventorySession | null>(null);

  // États pour la création
  const [newScope, setNewScope] = useState<InventoryScope>('complet');
  const [newCategorie, setNewCategorie] = useState<string>(categories[0] ?? 'Autre');
  const [newSelection, setNewSelection] = useState<Set<string>>(new Set());
  const [newNotes, setNewNotes] = useState('');

  // Filtre dans la saisie : afficher uniquement les non comptés ou seulement les écarts
  const [saisieFilter, setSaisieFilter] = useState<'all' | 'uncounted' | 'ecart'>('all');

  // ── Sessions ouvertes (draft / in_progress) ──────────────────────────────
  const openSessions = useMemo(
    () => sessions.filter(s => s.status === 'draft' || s.status === 'in_progress'),
    [sessions]
  );
  const validatedSessions = useMemo(
    () => sessions.filter(s => s.status === 'validated').sort((a, b) =>
      new Date(b.validatedAt ?? 0).getTime() - new Date(a.validatedAt ?? 0).getTime()
    ),
    [sessions]
  );
  const activeSession = activeSessionId
    ? sessions.find(s => s.id === activeSessionId)
    : null;

  // ── Création d'une session ───────────────────────────────────────────────
  const productsInScope = useMemo(() => {
    if (newScope === 'complet') return products;
    if (newScope === 'categorie') return products.filter(p => p.categorie === newCategorie);
    if (newScope === 'manuel') return products.filter(p => newSelection.has(p.id));
    return [];
  }, [newScope, newCategorie, newSelection, products]);

  const handleCreate = () => {
    if (!currentUser) return;
    if (productsInScope.length === 0) {
      toast.error(t('inventaire.noProductInScope'));
      return;
    }
    try {
      const session = createSession({
        scope: newScope,
        scopeCategorie: newScope === 'categorie' ? newCategorie : undefined,
        products: productsInScope,
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
        notes: newNotes.trim() || undefined,
      });
      toast.success(
        t('inventaire.sessionCreated')
          .replace('{num}', session.numero)
          .replace('{n}', String(session.lines.length))
      );
      setActiveSessionId(session.id);
      setTab('edit');
      setNewSelection(new Set());
      setNewNotes('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  // ── Saisie d'une ligne ───────────────────────────────────────────────────
  const handleCountChange = (productId: string, value: string) => {
    if (!activeSession) return;
    const stockCompte = value === '' ? null : (parseInt(value, 10) || 0);
    updateLine(activeSession.id, productId, { stockCompte });
  };

  const handleReasonChange = (productId: string, reason: AdjustmentReason) => {
    if (!activeSession) return;
    updateLine(activeSession.id, productId, { reason });
  };

  const handleLineNotes = (productId: string, notes: string) => {
    if (!activeSession) return;
    updateLine(activeSession.id, productId, { notes });
  };

  // ── Validation ───────────────────────────────────────────────────────────
  const handleValidate = () => {
    if (!activeSession || !currentUser) return;

    const result = validateSession(
      activeSession.id,
      currentUser.id,
      `${currentUser.prenom} ${currentUser.nom}`,
      {
        getProductPrixAchat: (productId) => {
          const p = products.find(x => x.id === productId);
          return p?.prixAchat ?? 0;
        },
        addMovementAndUpdateStock: ({
          productId, productName, ecart, stockTheorique, stockCompte,
          reason, notes, inventorySessionId, userId, userName,
        }) => {
          // Mouvement d'ajustement (la quantité peut être négative = perte)
          addMovement({
            date: new Date(),
            productId,
            productName,
            type: 'ajustement',
            quantity: ecart,
            stockBefore: stockTheorique,
            stockAfter: stockCompte,
            userId,
            userName,
            reason,
            inventorySessionId,
            notes,
          });
          // Mise à jour du stock produit (en delta — updateStock(id, delta))
          updateStock(productId, ecart);
        },
      }
    );

    if (result.success === false) {
      const list = result.missingReasons.slice(0, 3).join(', ') + (result.missingReasons.length > 3 ? '...' : '');
      toast.error(
        t('inventaire.missingReasonToast')
          .replace('{n}', String(result.missingReasons.length))
          .replace('{list}', list),
        { duration: 6000 }
      );
      return;
    }

    toast.success(
      t('inventaire.sessionValidated')
        .replace('{num}', result.session.numero)
        .replace('{n}', String(result.session.lines.filter(l => l.ecart !== 0).length))
    );
    setActiveSessionId(null);
    setTab('history');
  };

  const handleCancel = () => {
    if (!activeSession || !currentUser) return;
    if (!confirm(t('inventaire.cancelConfirm').replace('{num}', activeSession.numero))) {
      return;
    }
    cancelSession(activeSession.id, currentUser.id);
    toast.success(t('inventaire.sessionCancelled'));
    setActiveSessionId(null);
    setTab('new');
  };

  // ── Lignes filtrées pour la saisie ────────────────────────────────────────
  const visibleLines = useMemo(() => {
    if (!activeSession) return [];
    let lines: InventoryLine[] = activeSession.lines;
    if (saisieFilter === 'uncounted') {
      lines = lines.filter(l => l.stockCompte === null);
    } else if (saisieFilter === 'ecart') {
      lines = lines.filter(l => l.stockCompte !== null && l.ecart !== 0);
    }
    return lines;
  }, [activeSession, saisieFilter]);

  // ── Stats de la session active ────────────────────────────────────────────
  const sessionStats = useMemo(() => {
    if (!activeSession) return null;
    const lines = activeSession.lines;
    const counted = lines.filter(l => l.stockCompte !== null);
    const withEcart = counted.filter(l => l.ecart !== 0);
    const missingReason = withEcart.filter(l => !l.reason);
    return {
      total: lines.length,
      counted: counted.length,
      withEcart: withEcart.length,
      missingReason: missingReason.length,
    };
  }, [activeSession]);

  return (
    <div className="p-4 lg:p-8 animate-fade-in">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-grid">
        <h1 className="text-headline-lg nova-heading text-foreground">{t('inventaire.title')}</h1>
        {openSessions.length > 0 && tab !== 'edit' && (
          <div className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
            {openSessions.length > 1
              ? t('inventaire.sessionBadgePlural').replace('{n}', String(openSessions.length))
              : t('inventaire.sessionBadge').replace('{n}', String(openSessions.length))}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6 max-w-md">
        <button
          onClick={() => setTab('new')}
          className={cn(
            'flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all',
            tab === 'new' ? 'bg-card text-foreground' : 'text-muted-foreground'
          )}
        >
          <Plus className="w-3.5 h-3.5 inline mr-1" />
          {t('inventaire.tabNew')}
        </button>
        <button
          onClick={() => setTab('edit')}
          disabled={openSessions.length === 0 && !activeSession}
          className={cn(
            'flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all disabled:opacity-50',
            tab === 'edit' ? 'bg-card text-foreground' : 'text-muted-foreground'
          )}
        >
          <ClipboardList className="w-3.5 h-3.5 inline mr-1" />
          {openSessions.length > 0
            ? t('inventaire.tabEntry').replace('{n}', String(openSessions.length))
            : t('inventaire.tabEntry').replace(' ({n})', '')}
        </button>
        <button
          onClick={() => setTab('history')}
          className={cn(
            'flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all',
            tab === 'history' ? 'bg-card text-foreground' : 'text-muted-foreground'
          )}
        >
          <History className="w-3.5 h-3.5 inline mr-1" />
          {t('inventaire.tabHistory')}
        </button>
      </div>

      {/* ─────────────────────── Onglet : Nouvelle session ─────────────────────── */}
      {tab === 'new' && (
        <div className="space-y-4 max-w-2xl">
          <NovaCard accent title={t('inventaire.createCard')}>
            <div className="space-y-4">
              {/* Choix du scope */}
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">{t('inventaire.scopeLabel')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: 'complet' as InventoryScope, l: t('inventaire.scopeAll') },
                    { v: 'categorie' as InventoryScope, l: t('inventaire.scopeCategory') },
                    { v: 'manuel' as InventoryScope, l: t('inventaire.scopeManual') },
                  ]).map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setNewScope(opt.v)}
                      className={cn(
                        'px-3 py-3 rounded-lg text-sm font-medium border transition-all',
                        newScope === opt.v
                          ? 'bg-primary/15 text-primary border-primary/40'
                          : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                      )}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Catégorie si scope=categorie */}
              {newScope === 'categorie' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('inventaire.categoryLabel')}</label>
                  <select
                    value={newCategorie}
                    onChange={e => setNewCategorie(e.target.value)}
                    className="nova-input w-full py-2"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {/* Sélection manuelle */}
              {newScope === 'manuel' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    {t('inventaire.productsLabel').replace('{n}', String(newSelection.size)).replace('{total}', String(products.length))}
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                    {products.map(p => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newSelection.has(p.id)}
                          onChange={e => {
                            setNewSelection(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm text-foreground flex-1 truncate">{p.nom}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {t('inventaire.stockLabel').replace('{n}', String(p.stock))}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('inventaire.notesLabel')}</label>
                <textarea
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  className="nova-input w-full h-16 resize-none"
                  placeholder={t('inventaire.notesPlaceholder')}
                />
              </div>

              <div className="p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  {productsInScope.length > 1
                    ? t('inventaire.warningProductsPlural').replace('{n}', String(productsInScope.length))
                    : t('inventaire.warningProducts').replace('{n}', String(productsInScope.length))}
                </span>
              </div>

              <button
                onClick={handleCreate}
                disabled={productsInScope.length === 0}
                className="w-full nova-btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {t('inventaire.startBtn')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </NovaCard>

          {/* Sessions ouvertes existantes */}
          {openSessions.length > 0 && (
            <NovaCard title={t('inventaire.openSessionsCard')}>
              <div className="space-y-2">
                {openSessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setActiveSessionId(s.id); setTab('edit'); }}
                    className="w-full p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-between"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{s.numero}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.scope === 'complet' ? t('inventaire.scopeCompleteFull')
                          : s.scope === 'categorie' ? t('inventaire.scopeCategoryFull').replace('{cat}', s.scopeCategorie ?? '')
                          : t('inventaire.scopeManualFull')}
                        {' · '}{t('inventaire.sessionProducts').replace('{n}', String(s.lines.length)).replace('{m}', String(s.lines.filter(l => l.stockCompte !== null).length))} · {formatDateShort(new Date(s.createdAt))}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </NovaCard>
          )}
        </div>
      )}

      {/* ─────────────────────── Onglet : Saisie ─────────────────────── */}
      {tab === 'edit' && (
        <>
          {!activeSession && openSessions.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-12 h-12" />}
              title={t('inventaire.noOpenSession')}
              description={t('inventaire.noOpenSessionDesc')}
            />
          ) : !activeSession ? (
            <NovaCard accent title={t('inventaire.chooseSessionCard')}>
              <div className="space-y-2">
                {openSessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSessionId(s.id)}
                    className="w-full p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors flex items-center justify-between"
                  >
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{s.numero}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t('inventaire.sessionProducts')
                          .replace('{n}', String(s.lines.length))
                          .replace('{m}', String(s.lines.filter(l => l.stockCompte !== null).length))}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </NovaCard>
          ) : (
            <div className="space-y-4">
              {/* Barre de stats et actions */}
              <NovaCard accent>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{activeSession.numero}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {activeSession.scope === 'complet' ? t('inventaire.scopeCompleteFull')
                        : activeSession.scope === 'categorie' ? t('inventaire.scopeCategoryFull').replace('{cat}', activeSession.scopeCategorie ?? '')
                        : t('inventaire.scopeManualFull')}
                      {' '}{t('inventaire.sessionStarted')
                        .replace('{date}', formatDateShort(new Date(activeSession.createdAt)))
                        .replace('{time}', formatTime(new Date(activeSession.createdAt)))}
                    </p>
                  </div>
                  {sessionStats && (
                    <div className="flex gap-4 text-xs">
                      <div className="text-center">
                        <p className="text-muted-foreground">{t('inventaire.statCounted')}</p>
                        <p className="font-bold text-foreground tabular-nums">{sessionStats.counted} / {sessionStats.total}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">{t('inventaire.statGaps')}</p>
                        <p className={cn(
                          'font-bold tabular-nums',
                          sessionStats.withEcart > 0 ? 'text-amber-400' : 'text-foreground'
                        )}>{sessionStats.withEcart}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground">{t('inventaire.statMissingReasons')}</p>
                        <p className={cn(
                          'font-bold tabular-nums',
                          sessionStats.missingReason > 0 ? 'text-destructive' : 'text-foreground'
                        )}>{sessionStats.missingReason}</p>
                      </div>
                    </div>
                  )}
                </div>
              </NovaCard>

              {/* Filtre */}
              <div className="flex items-center gap-grid">
                <span className="text-xs text-muted-foreground">
                  <Filter className="w-3.5 h-3.5 inline mr-1" />{t('inventaire.filterLabel')}
                </span>
                {[
                  { v: 'all' as const, l: t('inventaire.filterAll') },
                  { v: 'uncounted' as const, l: t('inventaire.filterUncounted') },
                  { v: 'ecart' as const, l: t('inventaire.filterWithGap') },
                ].map(opt => (
                  <button
                    key={opt.v}
                    onClick={() => setSaisieFilter(opt.v)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                      saisieFilter === opt.v ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>

              {/* Tableau de saisie */}
              <NovaCard>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="nova-table-header">
                        <th className="text-left p-3 text-xs">{t('inventaire.colProduct')}</th>
                        <th className="text-right p-3 text-xs w-24">{t('inventaire.colTheoretical')}</th>
                        <th className="text-right p-3 text-xs w-32">{t('inventaire.colCounted')}</th>
                        <th className="text-right p-3 text-xs w-20">{t('inventaire.colGap')}</th>
                        <th className="text-left p-3 text-xs w-44">{t('inventaire.colReason')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLines.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                            {t('inventaire.noRowMatch')}
                          </td>
                        </tr>
                      ) : visibleLines.map(line => {
                        const hasEcart = line.stockCompte !== null && line.ecart !== 0;
                        const ecartColor = line.ecart > 0 ? 'text-emerald-400' : line.ecart < 0 ? 'text-destructive' : 'text-muted-foreground';
                        return (
                          <tr key={line.productId} className="border-t border-border hover:bg-muted/30">
                            <td className="p-3">
                              <p className="text-sm font-medium text-foreground">{line.productName}</p>
                              {line.notes && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 italic">{line.notes}</p>
                              )}
                            </td>
                            <td className="p-3 text-sm text-right text-muted-foreground tabular-nums">
                              {line.stockTheorique}
                            </td>
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                min="0"
                                value={line.stockCompte ?? ''}
                                onChange={e => handleCountChange(line.productId, e.target.value)}
                                className="nova-input w-24 py-1 text-right tabular-nums"
                                placeholder="—"
                              />
                            </td>
                            <td className={cn('p-3 text-sm text-right font-semibold tabular-nums', ecartColor)}>
                              {line.stockCompte === null ? '—' : (line.ecart > 0 ? `+${line.ecart}` : line.ecart)}
                            </td>
                            <td className="p-3">
                              {hasEcart ? (
                                <select
                                  value={line.reason ?? ''}
                                  onChange={e => handleReasonChange(line.productId, e.target.value as AdjustmentReason)}
                                  className={cn(
                                    'nova-input w-full py-1 text-xs',
                                    !line.reason && 'border-destructive/50'
                                  )}
                                >
                                  <option value="">{t('inventaire.reasonPlaceholder')}</option>
                                  {REASONS.map(r => (
                                    <option key={r} value={r}>{ADJUSTMENT_REASON_LABELS[r]}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </NovaCard>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-grid">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-destructive/20 hover:text-destructive transition-colors flex items-center justify-center gap-2"
                >
                  <FileX className="w-4 h-4" /> {t('inventaire.cancelBtn')}
                </button>
                <button
                  onClick={() => { setActiveSessionId(null); setTab('new'); }}
                  className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> {t('inventaire.draftBtn')}
                </button>
                <button
                  onClick={handleValidate}
                  disabled={sessionStats?.missingReason !== 0}
                  className="flex-1 nova-btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" /> {t('inventaire.validateBtn')}
                </button>
              </div>
              {sessionStats?.missingReason !== 0 && (
                <p className="text-[11px] text-destructive italic text-center">
                  {t('inventaire.missingReasonsWarning').replace('{n}', String(sessionStats?.missingReason ?? 0))}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ─────────────────────── Onglet : Historique ─────────────────────── */}
      {tab === 'history' && (
        <>
          {validatedSessions.length === 0 ? (
            <EmptyState
              icon={<History className="w-12 h-12" />}
              title={t('inventaire.noValidatedSession')}
              description={t('inventaire.noValidatedSessionDesc')}
            />
          ) : (
            <NovaCard accent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="nova-table-header">
                      <th className="text-left p-3 text-xs">{t('inventaire.histColNum')}</th>
                      <th className="text-left p-3 text-xs">{t('inventaire.histColScope')}</th>
                      <th className="text-left p-3 text-xs">{t('inventaire.histColDate')}</th>
                      <th className="text-left p-3 text-xs">{t('inventaire.histColUser')}</th>
                      <th className="text-right p-3 text-xs">{t('inventaire.histColQtyGap')}</th>
                      <th className="text-right p-3 text-xs">{t('inventaire.histColValueGap')}</th>
                      <th className="text-right p-3 text-xs">{t('inventaire.histColActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedSessions.map(s => (
                      <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-3 text-sm font-medium text-foreground">{s.numero}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {s.scope === 'complet' ? t('inventaire.scopeCompleteBadge')
                            : s.scope === 'categorie' ? s.scopeCategorie
                            : t('inventaire.scopeManualBadge')}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {s.validatedAt ? formatDateShort(new Date(s.validatedAt)) : '—'}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground truncate max-w-[140px]">
                          {s.validatedByName ?? '—'}
                        </td>
                        <td className={cn(
                          'p-3 text-sm text-right font-semibold tabular-nums',
                          (s.totalEcartQty ?? 0) > 0 ? 'text-emerald-400'
                            : (s.totalEcartQty ?? 0) < 0 ? 'text-destructive'
                            : 'text-muted-foreground'
                        )}>
                          {s.totalEcartQty !== undefined ? (s.totalEcartQty > 0 ? `+${s.totalEcartQty}` : s.totalEcartQty) : '0'}
                        </td>
                        <td className={cn(
                          'p-3 text-sm text-right font-semibold tabular-nums',
                          (s.totalEcartValue ?? 0) < 0 ? 'text-destructive' : 'text-foreground'
                        )}>
                          {formatFCFA(s.totalEcartValue ?? 0)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setViewedSession(s)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </NovaCard>
          )}
        </>
      )}

      {/* ─────────────────────── Drawer détails ─────────────────────── */}
      <SideDrawer
        open={!!viewedSession}
        onClose={() => setViewedSession(null)}
        title={viewedSession ? t('inventaire.drawerTitle').replace('{num}', viewedSession.numero) : ''}
      >
        {viewedSession && (
          <div className="space-y-5">
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium">{t('inventaire.drawerScope')}</span>{' '}
                {viewedSession.scope === 'complet' ? t('inventaire.scopeCompleteFull')
                  : viewedSession.scope === 'categorie' ? t('inventaire.scopeCategoryFull').replace('{cat}', viewedSession.scopeCategorie ?? '')
                  : t('inventaire.scopeManualFull')}
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium">{t('inventaire.drawerCreatedBy')}</span> {viewedSession.createdByName}{' '}
                — {formatDateShort(new Date(viewedSession.createdAt))}
              </p>
              {viewedSession.validatedAt && (
                <p className="text-muted-foreground">
                  <span className="font-medium">{t('inventaire.drawerValidatedBy')}</span> {viewedSession.validatedByName}{' '}
                  — {formatDateShort(new Date(viewedSession.validatedAt))}
                </p>
              )}
              {viewedSession.notes && (
                <p className="text-muted-foreground italic mt-2 p-2 bg-muted/40 rounded">
                  {viewedSession.notes}
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-muted/40 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('inventaire.drawerTotalGap')}</p>
                <p className={cn(
                  'text-lg font-bold tabular-nums',
                  (viewedSession.totalEcartQty ?? 0) < 0 ? 'text-destructive' : 'text-foreground'
                )}>
                  {viewedSession.totalEcartQty !== undefined ? (viewedSession.totalEcartQty > 0 ? `+${viewedSession.totalEcartQty}` : viewedSession.totalEcartQty) : 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('inventaire.drawerValue')}</p>
                <p className={cn(
                  'text-base font-bold tabular-nums',
                  (viewedSession.totalEcartValue ?? 0) < 0 ? 'text-destructive' : 'text-foreground'
                )}>
                  {formatFCFA(viewedSession.totalEcartValue ?? 0)}
                </p>
              </div>
            </div>

            {/* Lignes avec écart */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2">{t('inventaire.drawerAdjustments')}</h4>
              {(() => {
                const ecartLines = viewedSession.lines.filter(l => l.ecart !== 0);
                if (ecartLines.length === 0) {
                  return <p className="text-xs text-muted-foreground italic">{t('inventaire.drawerNoGap')}</p>;
                }
                return (
                  <div className="space-y-1.5">
                    {ecartLines.map(l => (
                      <div key={l.productId} className="p-2 rounded-lg bg-muted/30 text-xs">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-medium text-foreground truncate">{l.productName}</span>
                          <span className={cn(
                            'font-semibold tabular-nums',
                            l.ecart > 0 ? 'text-emerald-400' : 'text-destructive'
                          )}>
                            {l.ecart > 0 ? `+${l.ecart}` : l.ecart}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {l.stockTheorique} → {l.stockCompte}
                          {l.reason && ` · ${ADJUSTMENT_REASON_LABELS[l.reason]}`}
                        </p>
                        {l.notes && <p className="text-[10px] italic text-muted-foreground mt-0.5">{l.notes}</p>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </SideDrawer>
    </div>
  );
};

export default InventairePage;
