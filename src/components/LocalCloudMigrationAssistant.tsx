import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, Loader2 } from 'lucide-react';
import { NovaCard } from '@/components/ui/NovaCard';
import { collectBackupData } from '@/lib/backup/export';
import { getBoutiqueId, finalizeLocalToCloudMigrationAccount } from '@/services/boutiqueService';
import {
  closeMigrationTargetSession,
  executeAuthenticatedMigration,
  openMigrationTargetSession,
  prepareAuthenticatedMigration,
  type MigrationTargetSession,
} from '@/lib/migration/firebaseSession';
import type { LocalToCloudMigrationPlan, MigrationReport } from '@/lib/migration/localToCloud';

type Step = 'idle' | 'planning' | 'review' | 'executing' | 'done';

export function LocalCloudMigrationAssistant() {
  const sourceBoutiqueId = getBoutiqueId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [plan, setPlan] = useState<LocalToCloudMigrationPlan | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const sessionRef = useRef<MigrationTargetSession | null>(null);

  useEffect(() => () => {
    if (sessionRef.current) void closeMigrationTargetSession(sessionRef.current);
  }, []);

  if (!sourceBoutiqueId.startsWith('local-')) return null;

  const resetSession = async () => {
    const current = sessionRef.current;
    sessionRef.current = null;
    if (current) await closeMigrationTargetSession(current);
  };

  const analyze = async () => {
    if (!email.trim() || !password) {
      setError('Saisissez le compte de récupération de la boutique cloud.');
      return;
    }
    setStep('planning');
    setError('');
    setPlan(null);
    setReport(null);
    setConfirmed(false);
    await resetSession();
    try {
      const session = await openMigrationTargetSession(email, password);
      sessionRef.current = session;
      const nextPlan = await prepareAuthenticatedMigration(collectBackupData(), sourceBoutiqueId, session);
      setPlan(nextPlan);
      setStep('review');
    } catch (cause) {
      await resetSession();
      setError(cause instanceof Error ? cause.message : String(cause));
      setStep('idle');
    }
  };

  const execute = async () => {
    const session = sessionRef.current;
    if (!plan || !session || !confirmed || !plan.executable) return;
    setStep('executing');
    setError('');
    try {
      const nextReport = await executeAuthenticatedMigration(plan, {
        approved: true,
        planId: plan.planId,
        sourceChecksum: plan.sourceChecksum,
        targetBoutiqueId: plan.targetBoutiqueId,
      }, session);
      setReport(nextReport);
      if (!nextReport.success) {
        setError('Migration incomplète : aucune bascule de boutique n’a été effectuée. Vous pouvez relancer le même plan sans écrasement.');
        setStep('review');
        return;
      }

      // The default tenant changes only after every create succeeded.
      await finalizeLocalToCloudMigrationAccount(email, password, session.targetBoutiqueId);
      await resetSession();
      setStep('done');
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStep('review');
    }
  };

  return (
    <NovaCard accent className="w-full max-w-2xl mt-4">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <CloudUpload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Migrer les données locales vers le cloud</p>
            <p className="text-xs text-muted-foreground mt-1">
              L’analyse est sans écriture. La boutique locale reste active tant que toute la migration n’a pas réussi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email de récupération cloud</label>
            <input className="nova-input w-full" type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={step === 'planning' || step === 'executing'} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Mot de passe</label>
            <input className="nova-input w-full" type="password" value={password} onChange={event => setPassword(event.target.value)} disabled={step === 'planning' || step === 'executing'} />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span>
          </div>
        )}

        {plan && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-xs">
            <p className="font-medium text-foreground">Résultat de l’analyse</p>
            <div className="grid grid-cols-3 gap-2">
              <span>À créer : <strong>{plan.summary.create}</strong></span>
              <span>Déjà présents : <strong>{plan.summary.skip_duplicate}</strong></span>
              <span className={plan.summary.conflict ? 'text-destructive' : ''}>Conflits : <strong>{plan.summary.conflict}</strong></span>
            </div>
            {plan.summary.conflict > 0 ? (
              <p className="text-destructive">Aucune écriture n’est autorisée tant que ces conflits ne sont pas résolus.</p>
            ) : (
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                <span>Je confirme la copie vers la boutique cloud <strong>{plan.targetBoutiqueId.slice(0, 8).toUpperCase()}</strong> et la bascule uniquement après succès complet.</span>
              </label>
            )}
          </div>
        )}

        {report?.success && (
          <div className="flex items-center gap-2 text-xs text-secondary"><CheckCircle2 className="w-4 h-4" /> {report.created} élément(s) migré(s).</div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={analyze} disabled={step === 'planning' || step === 'executing'} className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50">
            {step === 'planning' ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Analyse…</span> : 'Analyser sans écrire'}
          </button>
          {plan?.executable && (
            <button onClick={execute} disabled={!confirmed || step === 'executing'} className="nova-btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {step === 'executing' ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Migration…</span> : 'Confirmer et migrer'}
            </button>
          )}
        </div>
      </div>
    </NovaCard>
  );
}
