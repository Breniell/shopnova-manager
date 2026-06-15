import React, { useCallback, useEffect, useState } from 'react';
import {
  collection, getDocs, setDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import {
  KeyRound, Plus, Search, Copy, Check, AlertTriangle, ShieldOff,
  Clock, CheckCircle2, X, Loader2, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';
import { getSuperAdminFirebase } from '@/lib/firebase';
import { parseLicense } from '@/lib/license/verify';
import type { RegistryEntry } from '@/services/registryService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LicenseDoc {
  licenseId:           string;
  boutiqueId:          string;
  plan:                'trial' | 'standard';
  issuedAt:            number;
  expiresAt:           number;
  holderName?:         string;
  holderContact?:      string;
  licenseStr?:         string;
  status:              'active' | 'revoked';
  pending:             boolean;
}

type FilterType = 'all' | 'active' | 'expiring' | 'expired' | 'revoked';

const DAY_MS = 86_400_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysLeft(expiresAt: number): number {
  return Math.ceil((expiresAt - Date.now()) / DAY_MS);
}

function buildCliCommand(opts: {
  boutiqueId: string; plan: string; days: number;
  holderName?: string; holderContact?: string;
}): string {
  let cmd = `node scripts/license-gen/generate.mjs --boutique ${opts.boutiqueId} --plan ${opts.plan} --days ${opts.days}`;
  if (opts.holderName)    cmd += ` --name "${opts.holderName}"`;
  if (opts.holderContact) cmd += ` --contact "${opts.holderContact}"`;
  return cmd;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DaysLeftBadge({ expiresAt, pending, revoked }: { expiresAt: number; pending: boolean; revoked: boolean }) {
  const { t } = useTranslation();
  if (pending || revoked) return <span className="text-muted-foreground text-xs">—</span>;
  const dl = daysLeft(expiresAt);
  if (dl > 30)  return <span className="text-green-600 text-xs font-mono font-semibold">{dl}j</span>;
  if (dl > 0)   return <span className="text-orange-500 text-xs font-mono font-semibold">{dl}j</span>;
  return <span className="text-destructive text-xs font-semibold">{t('superadmin.licenseExpired')}</span>;
}

function StatusBadge({ lic }: { lic: LicenseDoc }) {
  const { t } = useTranslation();
  const dl = daysLeft(lic.expiresAt);
  if (lic.status === 'revoked') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-medium">
      <ShieldOff className="w-2.5 h-2.5" />{t('superadmin.licenseStatusRevoked')}
    </span>;
  }
  if (lic.pending) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-medium">
      <Clock className="w-2.5 h-2.5" />{t('superadmin.licenseStatusPending')}
    </span>;
  }
  if (dl <= 0) {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-medium">
      <AlertTriangle className="w-2.5 h-2.5" />{t('superadmin.licenseStatusExpired')}
    </span>;
  }
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-700 text-[10px] font-medium">
    <CheckCircle2 className="w-2.5 h-2.5" />{t('superadmin.licenseStatusActive')}
  </span>;
}

// ─── Revoke Modal ─────────────────────────────────────────────────────────────

function RevokeModal({ lic, onCancel, onConfirm, revoking }: {
  lic: LicenseDoc;
  onCancel:  () => void;
  onConfirm: () => void;
  revoking:  boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
            <ShieldOff className="w-5 h-5 text-destructive" />
          </div>
          <h2 className="font-semibold text-foreground">{t('superadmin.licenseRevokeTitle')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('superadmin.licenseRevokeDesc')}</p>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{t('superadmin.licenseRevokeOfflineNote')}</p>
        </div>
        <p className="text-xs font-mono text-muted-foreground break-all">{lic.boutiqueId}</p>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel} disabled={revoking}
            className="flex-1 py-2.5 rounded-lg bg-muted text-foreground text-sm hover:bg-muted/80 transition-colors disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} disabled={revoking}
            className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {revoking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('superadmin.licenseRevokeConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Paste Modal (for pending rows in table) ──────────────────────────────────

function PasteModal({ lic, onClose, onDone }: {
  lic:    LicenseDoc;
  onClose: () => void;
  onDone:  (updated: LicenseDoc) => void;
}) {
  const { t } = useTranslation();
  const [key,     setKey]     = useState('');
  const [error,   setError]   = useState('');
  const [warning, setWarning] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [copied,  setCopied]  = useState(false);

  const cliCmd = buildCliCommand({
    boutiqueId:   lic.boutiqueId,
    plan:         lic.plan,
    days:         Math.round((lic.expiresAt - lic.issuedAt) / DAY_MS),
    holderName:   lic.holderName,
    holderContact: lic.holderContact,
  });

  async function handleSave() {
    const trimmed = key.trim();
    if (!trimmed.startsWith('LGW1-')) { setError(t('superadmin.licensePasteErrFormat')); return; }
    const parsed = parseLicense(trimmed);
    if (!parsed)                       { setError(t('superadmin.licensePasteErrFormat')); return; }

    const warns: string[] = [];
    if (parsed.boutiqueId !== lic.boutiqueId) warns.push(t('superadmin.licensePasteWarnBoutique'));
    const diff = Math.abs(parsed.expiresAt - lic.expiresAt) / DAY_MS;
    if (diff > 1) warns.push(t('superadmin.licensePasteWarnExpiry').replace('{days}', String(Math.round(diff))));
    if (warns.length) { setWarning(warns.join(' ')); }

    setSaving(true);
    try {
      const fb = getSuperAdminFirebase();
      if (!fb) return;
      const updates = {
        licenseStr: trimmed,
        pending:    false,
        issuedAt:   parsed.issuedAt,
        expiresAt:  parsed.expiresAt,
        ...(parsed.holder?.name    ? { holderName:    parsed.holder.name }    : {}),
        ...(parsed.holder?.contact ? { holderContact: parsed.holder.contact } : {}),
      };
      await updateDoc(doc(fb.saDb, 'licenses', lic.licenseId), updates);
      onDone({ ...lic, ...updates });
    } catch {
      setError(t('superadmin.licenseRevokeErr'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-background rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">{t('superadmin.licenseStep2Title')}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CLI reminder */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('superadmin.licenseCliTitle')}</p>
          <div className="flex items-start gap-2">
            <code className="flex-1 text-[11px] font-mono bg-muted/50 border rounded-lg px-3 py-2 select-all break-all text-foreground">
              {cliCmd}
            </code>
            <button onClick={() => { void navigator.clipboard.writeText(cliCmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="shrink-0 p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-muted-foreground">
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Paste field */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t('superadmin.licensePasteLabel')}</label>
          <textarea rows={4}
            className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50
                       focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            placeholder="LGW1-…"
            value={key}
            onChange={e => { setKey(e.target.value); setError(''); setWarning(''); }}
            spellCheck={false}
          />
        </div>

        {warning && (
          <div className="flex items-start gap-2 text-amber-600 text-xs p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{warning}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground text-sm hover:bg-muted/80 transition-colors">
            {t('common.cancel')}
          </button>
          <button onClick={() => void handleSave()} disabled={saving || !key.trim()}
            className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                       hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('superadmin.licenseFinalizeBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New License Modal (2 steps) ──────────────────────────────────────────────

interface NewLicenseModalProps {
  boutiques:  RegistryEntry[];
  onClose:    () => void;
  onCreated:  (lic: LicenseDoc) => void;
}

function NewLicenseModal({ boutiques, onClose, onCreated }: NewLicenseModalProps) {
  const { t } = useTranslation();

  const [step, setStep]     = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  // Step 1
  const [boutiqueId,    setBoutiqueId]    = useState('');
  const [useManual,     setUseManual]     = useState(false);
  const [manualBid,     setManualBid]     = useState('');
  const [plan,          setPlan]          = useState<'trial' | 'standard'>('standard');
  const [days,          setDays]          = useState(365);
  const [holderName,    setHolderName]    = useState('');
  const [holderContact, setHolderContact] = useState('');
  const [step1Err,      setStep1Err]      = useState('');

  // Step 2
  const [pendingDoc, setPendingDoc] = useState<LicenseDoc | null>(null);
  const [cliCmd,     setCliCmd]     = useState('');
  const [pasteKey,   setPasteKey]   = useState('');
  const [pasteErr,   setPasteErr]   = useState('');
  const [pasteWarn,  setPasteWarn]  = useState('');
  const [finalising, setFinalising] = useState(false);
  const [finalDone,  setFinalDone]  = useState(false);
  const [finalLic,   setFinalLic]   = useState<LicenseDoc | null>(null);

  const effectiveBid = useManual ? manualBid.trim() : boutiqueId;

  async function handlePrepare() {
    if (!effectiveBid) { setStep1Err(t('superadmin.licenseErrNoBoutique')); return; }
    const fb = getSuperAdminFirebase();
    if (!fb) return;

    setSaving(true);
    try {
      const licenseId = crypto.randomUUID();
      const now       = Date.now();
      const expiresAt = now + days * DAY_MS;
      const data: Omit<LicenseDoc, 'licenseId'> & { createdAtSuperadmin: ReturnType<typeof serverTimestamp> } = {
        boutiqueId: effectiveBid,
        plan,
        issuedAt:  now,
        expiresAt,
        status:    'active',
        pending:   true,
        createdAtSuperadmin: serverTimestamp(),
        ...(holderName    ? { holderName }    : {}),
        ...(holderContact ? { holderContact } : {}),
      };
      await setDoc(doc(fb.saDb, 'licenses', licenseId), data);

      const lic: LicenseDoc = { licenseId, ...data };
      setPendingDoc(lic);
      setCliCmd(buildCliCommand({ boutiqueId: effectiveBid, plan, days, holderName, holderContact }));
      setStep(2);
      onCreated(lic);
    } catch (err) {
      console.error('[SALicenses] handlePrepare error:', err);
      setStep1Err(t('superadmin.licenseErrCreate'));
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalise() {
    if (!pendingDoc) return;
    const trimmed = pasteKey.trim();
    if (!trimmed.startsWith('LGW1-')) { setPasteErr(t('superadmin.licensePasteErrFormat')); return; }
    const parsed = parseLicense(trimmed);
    if (!parsed)                       { setPasteErr(t('superadmin.licensePasteErrFormat')); return; }

    const warns: string[] = [];
    if (parsed.boutiqueId !== pendingDoc.boutiqueId) warns.push(t('superadmin.licensePasteWarnBoutique'));
    const diff = Math.abs(parsed.expiresAt - pendingDoc.expiresAt) / DAY_MS;
    if (diff > 1) warns.push(t('superadmin.licensePasteWarnExpiry').replace('{days}', String(Math.round(diff))));
    setPasteWarn(warns.join(' '));

    setFinalising(true);
    try {
      const fb = getSuperAdminFirebase();
      if (!fb) return;
      const updates = {
        licenseStr: trimmed,
        pending:    false,
        issuedAt:   parsed.issuedAt,
        expiresAt:  parsed.expiresAt,
        ...(parsed.holder?.name    ? { holderName:    parsed.holder.name }    : {}),
        ...(parsed.holder?.contact ? { holderContact: parsed.holder.contact } : {}),
      };
      await updateDoc(doc(fb.saDb, 'licenses', pendingDoc.licenseId), updates);
      const updated = { ...pendingDoc, ...updates };
      setFinalLic(updated);
      onCreated(updated);
      setFinalDone(true);
    } catch {
      setPasteErr(t('superadmin.licenseRevokeErr'));
    } finally {
      setFinalising(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
         onClick={e => { if (e.target === e.currentTarget && !finalDone) onClose(); }}>
      <div className="w-full max-w-lg bg-background rounded-2xl shadow-2xl p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">{t('superadmin.licenseNewTitle')}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2">
          {([1, 2] as const).map(s => (
            <div key={s} className={cn(
              'flex-1 h-1 rounded-full transition-colors',
              step >= s ? 'bg-primary' : 'bg-muted',
            )} />
          ))}
        </div>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('superadmin.licenseStep1Title')}
            </p>

            {/* Boutique selector */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t('superadmin.licenseFieldBoutique')}</label>
              {!useManual ? (
                <select
                  value={boutiqueId}
                  onChange={e => setBoutiqueId(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">{t('superadmin.licenseFieldBoutiqueSelect')}</option>
                  {boutiques.map(b => (
                    <option key={b.boutiqueId} value={b.boutiqueId}>
                      {b.nom || b.boutiqueId} — {b.boutiqueId.slice(0, 8)}…
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={manualBid}
                  onChange={e => setManualBid(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="boutiqueId exact (UUID)"
                  spellCheck={false}
                  autoCorrect="off"
                />
              )}
              <button
                type="button"
                onClick={() => setUseManual(v => !v)}
                className="text-xs text-primary hover:underline"
              >
                {useManual ? t('superadmin.licenseFieldBoutiqueSelect') : t('superadmin.licenseFieldBoutiqueManual')}
              </button>
            </div>

            {/* Plan */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t('superadmin.licenseFieldPlan')}</label>
              <div className="flex gap-2">
                {(['standard', 'trial'] as const).map(p => (
                  <button key={p} type="button"
                    onClick={() => setPlan(p)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium transition-colors border',
                      plan === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-foreground border-transparent',
                    )}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Days */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t('superadmin.licenseFieldDays')}</label>
              <div className="flex gap-2">
                {[30, 90, 365].map(d => (
                  <button key={d} type="button"
                    onClick={() => setDays(d)}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                      days === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-foreground border-transparent',
                    )}>
                    {d}j
                  </button>
                ))}
                <input
                  type="number" min={1} max={3650}
                  value={![30, 90, 365].includes(days) ? days : ''}
                  onChange={e => { const v = parseInt(e.target.value); if (v > 0) setDays(v); }}
                  className="w-20 rounded-lg border bg-background px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="…"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t('superadmin.licenseExpiresOn').replace('{date}', new Date(Date.now() + days * DAY_MS).toLocaleDateString())}
              </p>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('superadmin.licenseFieldName')}</label>
                <input type="text" value={holderName} onChange={e => setHolderName(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Nom du client" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('superadmin.licenseFieldContact')}</label>
                <input type="text" value={holderContact} onChange={e => setHolderContact(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="+237 6..." />
              </div>
            </div>

            {step1Err && (
              <div className="flex items-center gap-2 text-destructive text-xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{step1Err}
              </div>
            )}

            <button onClick={() => void handlePrepare()} disabled={saving || !effectiveBid}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                         hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('superadmin.licenseStep1Btn')}
            </button>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('superadmin.licenseStep2Title')}
            </p>

            {/* CLI command */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t('superadmin.licenseCliTitle')}</p>
              <div className="flex items-start gap-2">
                <code className="flex-1 text-[11px] font-mono bg-muted/50 border rounded-lg px-3 py-2.5 select-all break-all text-foreground leading-relaxed">
                  {cliCmd}
                </code>
                <button
                  onClick={() => { void navigator.clipboard.writeText(cliCmd); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="shrink-0 p-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-muted-foreground"
                  title={t('superadmin.licenseCliCopy')}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700">{t('superadmin.licenseCliNote')}</p>
              </div>
            </div>

            {!finalDone ? (
              <>
                {/* Paste field */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('superadmin.licensePasteLabel')}</label>
                  <textarea rows={4}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50
                               focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    placeholder="LGW1-…"
                    value={pasteKey}
                    onChange={e => { setPasteKey(e.target.value); setPasteErr(''); setPasteWarn(''); }}
                    spellCheck={false}
                  />
                </div>

                {pasteWarn && (
                  <div className="flex items-start gap-2 text-amber-600 text-xs p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{pasteWarn}
                  </div>
                )}
                {pasteErr && (
                  <div className="flex items-center gap-2 text-destructive text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{pasteErr}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">{t('superadmin.licensePasteSkip')}</p>

                <div className="flex gap-3">
                  <button onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg bg-muted text-foreground text-sm hover:bg-muted/80 transition-colors">
                    {t('superadmin.licensePendingClose')}
                  </button>
                  <button onClick={() => void handleFinalise()} disabled={finalising || !pasteKey.trim()}
                    className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                               hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {finalising && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t('superadmin.licenseFinalizeBtn')}
                  </button>
                </div>
              </>
            ) : finalLic?.licenseStr ? (
              /* Success state */
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t('superadmin.licenseFinalDone')}</span>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t('superadmin.licenseCopyKeyHint')}</p>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 text-[10px] font-mono bg-muted/50 border rounded-lg px-3 py-2 select-all break-all text-foreground">
                      {finalLic.licenseStr}
                    </code>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(finalLic.licenseStr!);
                        setKeyCopied(true);
                        setTimeout(() => setKeyCopied(false), 2000);
                      }}
                      className="shrink-0 p-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-muted-foreground"
                    >
                      {keyCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <button onClick={onClose}
                  className="w-full py-2.5 rounded-lg bg-muted text-foreground text-sm hover:bg-muted/80 transition-colors">
                  {t('common.close')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SALicenses main component ────────────────────────────────────────────────

interface Props {
  boutiques: RegistryEntry[];
}

export const SALicenses: React.FC<Props> = ({ boutiques }) => {
  const { t } = useTranslation();

  const [licenses,   setLicenses]   = useState<LicenseDoc[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<FilterType>('all');
  const [search,     setSearch]     = useState('');
  const [showNew,    setShowNew]    = useState(false);
  const [pasteFor,   setPasteFor]   = useState<LicenseDoc | null>(null);
  const [revokeFor,  setRevokeFor]  = useState<LicenseDoc | null>(null);
  const [revoking,   setRevoking]   = useState(false);

  const load = useCallback(async () => {
    const fb = getSuperAdminFirebase();
    if (!fb) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(collection(fb.saDb, 'licenses'));
      const docs = snap.docs.map(d => ({ licenseId: d.id, ...d.data() } as LicenseDoc));
      setLicenses(docs.sort((a, b) => b.issuedAt - a.issuedAt));
    } catch (err) {
      console.error('[SALicenses] loadLicenses error:', err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function getBoutiqueName(bid: string): string {
    const b = boutiques.find(x => x.boutiqueId === bid);
    return b?.nom ? b.nom : bid.slice(0, 10) + '…';
  }

  function upsertLicense(updated: LicenseDoc) {
    setLicenses(prev => {
      const idx = prev.findIndex(l => l.licenseId === updated.licenseId);
      if (idx === -1) return [updated, ...prev];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  }

  async function handleRevoke(lic: LicenseDoc) {
    const fb = getSuperAdminFirebase();
    if (!fb) return;
    setRevoking(true);
    try {
      await updateDoc(doc(fb.saDb, 'licenses', lic.licenseId), { status: 'revoked' });
      await setDoc(
        doc(fb.saDb, `boutiques/${lic.boutiqueId}/_license/current`),
        { revoked: true },
        { merge: true },
      );
      upsertLicense({ ...lic, status: 'revoked' });
    } catch (err) {
      console.error('[SALicenses] handleRevoke error:', err);
    } finally { setRevoking(false); setRevokeFor(null); }
  }

  // ── Filtering + search ──────────────────────────────────────────────────────

  const filtered = licenses.filter(lic => {
    const dl = daysLeft(lic.expiresAt);
    if (filter === 'active'   && !(lic.status === 'active'  && !lic.pending && dl > 0))            return false;
    if (filter === 'expiring' && !(lic.status === 'active'  && !lic.pending && dl > 0 && dl <= 30)) return false;
    if (filter === 'expired'  && !(lic.status === 'active'  && !lic.pending && dl <= 0))            return false;
    if (filter === 'revoked'  && lic.status !== 'revoked')                                          return false;
    if (search) {
      const q = search.toLowerCase();
      const name = getBoutiqueName(lic.boutiqueId).toLowerCase();
      if (!lic.boutiqueId.toLowerCase().includes(q) && !name.includes(q) &&
          !(lic.holderName?.toLowerCase().includes(q) ?? false)) return false;
    }
    return true;
  });

  const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
    { key: 'all',      label: t('superadmin.licenseFilterAll') },
    { key: 'active',   label: t('superadmin.licenseFilterActive') },
    { key: 'expiring', label: t('superadmin.licenseFilterExpiring') },
    { key: 'expired',  label: t('superadmin.licenseFilterExpired') },
    { key: 'revoked',  label: t('superadmin.licenseFilterRevoked') },
  ];

  return (
    <div className="space-y-4">

      {/* Header + search + new */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('superadmin.licenseSearch')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm text-foreground
                       placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('superadmin.licenseNewBtn')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              filter === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}>
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t('superadmin.loading')}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <KeyRound className="w-8 h-8 opacity-30" />
          <p className="text-sm">{t('superadmin.licenseNone')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{t('superadmin.licenseColBoutique')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{t('superadmin.licenseColPlan')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">{t('superadmin.licenseColExpiresAt')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">{t('superadmin.licenseColDaysLeft')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{t('superadmin.licenseColStatus')}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">{t('superadmin.licenseColActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map(lic => (
                <LicenseRow
                  key={lic.licenseId}
                  lic={lic}
                  boutiqueName={getBoutiqueName(lic.boutiqueId)}
                  onPaste={() => setPasteFor(lic)}
                  onRevoke={() => setRevokeFor(lic)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showNew && (
        <NewLicenseModal
          boutiques={boutiques}
          onClose={() => setShowNew(false)}
          onCreated={upsertLicense}
        />
      )}
      {pasteFor && (
        <PasteModal
          lic={pasteFor}
          onClose={() => setPasteFor(null)}
          onDone={updated => { upsertLicense(updated); setPasteFor(null); }}
        />
      )}
      {revokeFor && (
        <RevokeModal
          lic={revokeFor}
          revoking={revoking}
          onCancel={() => setRevokeFor(null)}
          onConfirm={() => void handleRevoke(revokeFor)}
        />
      )}
    </div>
  );
};

// ─── License row ──────────────────────────────────────────────────────────────

function LicenseRow({ lic, boutiqueName, onPaste, onRevoke }: {
  lic:          LicenseDoc;
  boutiqueName: string;
  onPaste:      () => void;
  onRevoke:     () => void;
}) {
  const { t } = useTranslation();
  const [keyCopied, setKeyCopied] = useState(false);

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      {/* Boutique */}
      <td className="px-4 py-3">
        <p className="text-xs font-medium text-foreground">{boutiqueName}</p>
        <p className="text-[10px] text-muted-foreground font-mono">{lic.boutiqueId.slice(0, 12)}…</p>
        {lic.holderName && <p className="text-[10px] text-muted-foreground">{lic.holderName}</p>}
      </td>
      {/* Plan */}
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-foreground">{lic.plan}</span>
      </td>
      {/* Expires */}
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-xs text-muted-foreground">
          {lic.pending ? '—' : new Date(lic.expiresAt).toLocaleDateString()}
        </span>
      </td>
      {/* Days left */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <DaysLeftBadge expiresAt={lic.expiresAt} pending={lic.pending} revoked={lic.status === 'revoked'} />
      </td>
      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge lic={lic} />
      </td>
      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {lic.pending && (
            <button onClick={onPaste}
              className="text-xs text-primary hover:underline font-medium px-2 py-1 rounded-md hover:bg-primary/10 transition-colors">
              {t('superadmin.licenseFinalizeBtn')}
            </button>
          )}
          {lic.licenseStr && (
            <button
              onClick={() => { void navigator.clipboard.writeText(lic.licenseStr!); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
              title={t('superadmin.licenseCopyKey')}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            >
              {keyCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
          {lic.holderContact && (
            <a href={`https://wa.me/${lic.holderContact.replace(/\D/g, '')}`}
               target="_blank" rel="noopener noreferrer"
               className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
               title={lic.holderContact}>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {lic.status === 'active' && !lic.pending && (
            <button onClick={onRevoke}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title={t('superadmin.licenseRevoke')}>
              <ShieldOff className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
