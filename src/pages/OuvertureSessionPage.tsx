/**
 * OuvertureSessionPage — démarrage d'une nouvelle session de caisse.
 *
 * Flux UX :
 *   • Si l'utilisateur a déjà une session ouverte (recovery, refresh page),
 *     on le redirige automatiquement vers la caisse.
 *   • Sinon, on affiche un formulaire minimal :
 *       - fond de caisse de départ (espèces présentes dans le tiroir)
 *       - notes (optionnel)
 *   • La dernière clôture du même caissier sert de suggestion pour le fond
 *     initial (s'il a clôturé hier à 50 000, on suggère 50 000 aujourd'hui).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { formatFCFA, formatDateShort, formatTime } from '@/utils/formatters';
import { Wallet, ArrowRight, LogOut, Info, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';

const OuvertureSessionPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuthStore();
  const { sessions, openSession, getOpenSessionForUser } = useCashSessionStore();

  const [fondInitial, setFondInitial] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si une session est déjà ouverte pour cet utilisateur → rediriger directement
  useEffect(() => {
    if (!currentUser) return;
    const open = getOpenSessionForUser(currentUser.id);
    if (open) {
      useCashSessionStore.getState()._setCurrentSessionId(open.id);
      navigate('/caisse', { replace: true });
    }
  }, [currentUser, getOpenSessionForUser, navigate]);

  // Dernière session du même caissier pour suggérer le fond
  const lastSession = useMemo(() => {
    if (!currentUser) return null;
    const mine = sessions
      .filter(s => s.userId === currentUser.id && s.status === 'closed')
      .sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime());
    return mine[0] ?? null;
  }, [sessions, currentUser]);

  const suggestedFond = lastSession?.totalCompte ?? 0;

  const handleSubmit = () => {
    if (!currentUser) return;
    const fond = parseInt(fondInitial, 10);
    if (!Number.isFinite(fond) || fond < 0) {
      toast.error(t('session.open.invalidFond'));
      return;
    }
    setIsSubmitting(true);
    try {
      openSession({
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`,
        fondInitial: fond,
        notesOuverture: notes.trim() || undefined,
      });
      toast.success(t('session.open.success'));
      navigate('/caisse', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseSuggested = () => {
    if (suggestedFond > 0) {
      setFondInitial(String(suggestedFond));
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{t('session.open.loginRequired')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <NovaCard accent>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="nova-heading text-lg text-foreground">{t('session.open.title')}</h1>
              <p className="text-xs text-muted-foreground">
                {t('session.open.greeting').replace('{name}', currentUser.prenom)}
              </p>
            </div>
          </div>

          {/* Dernière session — suggestion */}
          {lastSession && (
            <div className="mb-4 p-3 rounded-lg bg-muted/40 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{t('session.open.lastClose')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground">
                  {lastSession.closedAt && formatDateShort(new Date(lastSession.closedAt))}
                  {' • '}
                  {lastSession.closedAt && formatTime(new Date(lastSession.closedAt))}
                </span>
                <span className="font-semibold text-foreground tabular-nums">
                  {formatFCFA(lastSession.totalCompte ?? 0)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleUseSuggested}
                className="text-[11px] text-primary hover:underline mt-1"
              >
                {t('session.open.useSuggested')}
              </button>
            </div>
          )}

          {/* Formulaire */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {t('session.open.fondLabel')} *
              </label>
              <input
                type="number"
                value={fondInitial}
                onChange={e => setFondInitial(e.target.value)}
                className="nova-input w-full py-3 text-lg font-semibold tabular-nums"
                placeholder="0"
                min="0"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                {t('session.open.fondHint')}
              </p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {t('session.open.notesLabel')}
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="nova-input w-full h-16 resize-none"
                placeholder={t('session.open.notesPlaceholder')}
                maxLength={200}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{t('session.open.warning')}</span>
          </div>

          <div className="flex gap-grid mt-5">
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              {t('nav.logout')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !fondInitial}
              className="flex-1 nova-btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('session.open.starting') : (
                <>
                  {t('session.open.start')}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </NovaCard>
      </div>
    </div>
  );
};

export default OuvertureSessionPage;
