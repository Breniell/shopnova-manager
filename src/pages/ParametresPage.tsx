import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore, User } from '@/stores/useAuthStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { cn } from '@/lib/utils';
import { Store, Users, KeyRound, Trash2, Plus, X, Copy, Check, Cloud, Mail, Pencil, MapPin, LocateFixed, Loader2, PenLine, Smartphone, Printer, HardDrive, Download, Upload, ShieldCheck, ShieldOff, AlertTriangle, RotateCcw } from 'lucide-react';
import { isThermalAvailable } from '@/lib/thermalPrint';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';
import { ALL_LOCALES, LOCALE_LABELS } from '@/i18n/types';
import type { SupportedLocale } from '@/i18n/types';
import type { LocationPrecision } from '@/services/geoService';
import { detectAddressProgressively } from '@/services/geoService';
import { hasGeoConsent, setGeoConsent } from '@/lib/consent';
import {
  getBoutiqueId,
  getBoutiqueCode,
  getBoutiqueRecoveryErrorMessage,
  getBoutiqueRecoveryStatus,
  linkBoutiqueRecoveryAccount,
  sendBoutiqueRecoveryPasswordReset,
  type BoutiqueRecoveryStatus,
} from '@/services/boutiqueService';
import { exportBackup, daysSinceLastBackup } from '@/lib/backup/export';
import { parseBackupFile, restoreBackupData, type ParseResult } from '@/lib/backup/import';
import type { BackupData } from '@/lib/backup/types';

const ParametresPage: React.FC = () => {
  const { shop, updateShop } = useSettingsStore();
  const { users, addUser, updateUserPin, updateUserInfo, deleteUser } = useAuthStore();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'boutique' | 'users'>('boutique');
  const [geoConsentOn, setGeoConsentOn] = useState<boolean>(hasGeoConsent());
  const [showUserModal, setShowUserModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newUser, setNewUser] = useState({ prenom: '', nom: '', role: 'caissier' as 'gérant' | 'caissier', pin: '', confirmPin: '' });
  const [codeCopied, setCodeCopied] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editUserInfo, setEditUserInfo] = useState({ prenom: '', nom: '', role: 'caissier' as 'gérant' | 'caissier' });
  const [recoveryStatus, setRecoveryStatus] = useState<BoutiqueRecoveryStatus | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [isRecoverySaving, setIsRecoverySaving] = useState(false);

  // Printer
  const [printerList, setPrinterList] = useState<string[]>([]);
  const [isPrinterTesting, setIsPrinterTesting] = useState(false);

  // Address geo-detection
  const [isDetectingAddress, setIsDetectingAddress] = useState(false);
  const [addressPrecision, setAddressPrecision] = useState<LocationPrecision | null>(null);
  const [showManualAddress, setShowManualAddress] = useState(false);

  // Backup / restore
  const [showExportModal, setShowExportModal]   = useState(false);
  const [exportEncrypt, setExportEncrypt]       = useState(true);
  const [exportPassword, setExportPassword]     = useState('');
  const [exportPassword2, setExportPassword2]   = useState('');
  const [isExporting, setIsExporting]           = useState(false);
  const [backupReminderDays, setBackupReminderDays] = useState<number | null>(null);
  // Import flow
  const importFileRef = React.useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile]               = useState<File | null>(null);
  const [pendingMeta, setPendingMeta]               = useState<ParseResult['meta'] | null>(null);
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [importPassword, setImportPassword]         = useState('');
  const [pendingData, setPendingData]               = useState<BackupData | null>(null);
  const [showImportConfirm, setShowImportConfirm]   = useState(false);
  const [isRestoring, setIsRestoring]               = useState(false);
  const [restoreProgress, setRestoreProgress]       = useState<{ done: number; total: number } | null>(null);

  const [localShop, setLocalShop] = useState(shop);

  const boutiqueId = getBoutiqueId();
  const boutiqueCode = getBoutiqueCode(boutiqueId);
  const isLocalMode = boutiqueId === 'local-boutique' || boutiqueId.startsWith('local-');
  const isBoutiqueTab = activeTab === 'boutique';
  const isUsersTab = activeTab === 'users';

  useEffect(() => {
    getBoutiqueRecoveryStatus()
      .then(status => {
        setRecoveryStatus(status);
        setRecoveryEmail(status.email ?? '');
      })
      .catch(() => setRecoveryStatus(null));
  }, []);

  // Auto-detect address on first open if empty
  useEffect(() => {
    if (!localShop.adresse) {
      runAddressDetection();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runAddressDetection = async () => {
    setIsDetectingAddress(true);
    setAddressPrecision(null);
    let found = false;

    await detectAddressProgressively(
      (addr, precision) => {
        found = true;
        setLocalShop(prev => ({ ...prev, adresse: addr }));
        setAddressPrecision(precision);
      },
      10_000
    );

    setIsDetectingAddress(false);
    if (!found) {
      setShowManualAddress(true);
      toast.error(t('settings.boutique.addressNotFound'));
    }
  };

  useEffect(() => {
    if (isThermalAvailable()) {
      window.legwan!.printer!.list().then(setPrinterList).catch(() => {});
    }
  }, []);

  useEffect(() => { setBackupReminderDays(daysSinceLastBackup()); }, []);

  const handleTestPrint = async () => {
    if (!isThermalAvailable() || !localShop.printerName) return;
    setIsPrinterTesting(true);
    try {
      const result = await window.legwan!.printer!.test({ printerName: localShop.printerName, paperWidth: localShop.paperWidth });
      if (result.ok) toast.success(t('settings.printer.testOk'));
      else toast.error(t('settings.printer.testFail'));
    } catch {
      toast.error(t('settings.printer.testFail'));
    } finally {
      setIsPrinterTesting(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(boutiqueId).then(() => {
      setCodeCopied(true);
      toast.success(t('settings.code.copied'));
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  // ── Backup handlers ───────────────────────────────────────────────────────

  const handleExport = async () => {
    if (exportEncrypt) {
      if (!exportPassword) { toast.error(t('settings.backup.passwordRequired')); return; }
      if (exportPassword !== exportPassword2) { toast.error(t('settings.backup.passwordMismatch')); return; }
    }
    setIsExporting(true);
    try {
      await exportBackup(exportEncrypt ? exportPassword : null);
      setShowExportModal(false);
      setExportPassword('');
      setExportPassword2('');
      setBackupReminderDays(0);
      toast.success(t('settings.backup.exportSuccess'));
    } catch {
      toast.error(t('settings.backup.exportError'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const result = await parseBackupFile(file);

    if (!result.ok) {
      if (result.error === 'wrong_password' && result.meta) {
        // Encrypted — ask for password
        setPendingFile(file);
        setPendingMeta(result.meta ?? null);
        setImportPassword('');
        setShowImportPassword(true);
      } else {
        toast.error(t(`settings.backup.error_${result.error ?? 'unknown'}`));
      }
      return;
    }

    setPendingData(result.data!);
    setPendingMeta(result.meta ?? null);
    setShowImportConfirm(true);
  };

  const handleImportWithPassword = async () => {
    if (!pendingFile) return;
    const result = await parseBackupFile(pendingFile, importPassword);
    setShowImportPassword(false);
    if (!result.ok) {
      toast.error(
        result.error === 'wrong_password'
          ? t('settings.backup.wrongPassword')
          : t(`settings.backup.error_${result.error ?? 'unknown'}`)
      );
      return;
    }
    setPendingData(result.data!);
    setPendingMeta(result.meta ?? null);
    setShowImportConfirm(true);
  };

  const handleRestore = async () => {
    if (!pendingData) return;
    setIsRestoring(true);
    setRestoreProgress(null);
    try {
      await restoreBackupData(pendingData, (p) => setRestoreProgress({ done: p.done, total: p.total }));
      setShowImportConfirm(false);
      setPendingData(null);
      setPendingMeta(null);
      setRestoreProgress(null);
      setBackupReminderDays(0);
      toast.success(t('settings.backup.restoreSuccess'));
    } catch {
      toast.error(t('settings.backup.restoreError'));
    } finally {
      setIsRestoring(false);
    }
  };

  const refreshRecoveryStatus = async () => {
    const status = await getBoutiqueRecoveryStatus();
    setRecoveryStatus(status);
    setRecoveryEmail(status.email ?? recoveryEmail);
  };

  const handleEnableRecovery = async () => {
    if (!recoveryEmail.trim()) { toast.error(t('settings.recovery.emailLabel')); return; }
    if (recoveryPassword.length < 6) { toast.error(t('settings.recovery.passwordLabel')); return; }
    if (recoveryPassword !== recoveryPasswordConfirm) { toast.error(t('settings.recovery.confirmLabel')); return; }

    setIsRecoverySaving(true);
    try {
      await linkBoutiqueRecoveryAccount(recoveryEmail, recoveryPassword);
      setRecoveryPassword('');
      setRecoveryPasswordConfirm('');
      await refreshRecoveryStatus();
      toast.success(t('settings.recovery.active'));
    } catch (err) {
      toast.error(getBoutiqueRecoveryErrorMessage(err));
    } finally {
      setIsRecoverySaving(false);
    }
  };

  const handleSendRecoveryReset = async () => {
    if (!recoveryEmail.trim()) { toast.error(t('settings.recovery.emailLabel')); return; }
    try {
      await sendBoutiqueRecoveryPasswordReset(recoveryEmail);
      toast.success(t('settings.recovery.sendReset'));
    } catch (err) {
      toast.error(getBoutiqueRecoveryErrorMessage(err));
    }
  };

  const handleSaveShop = () => {
    updateShop(localShop);
    try { localStorage.setItem('legwan-locale', localShop.langue); } catch { /* ignore */ }
    toast.success(t('settings.boutique.saved'));
  };

  const handleAddUser = async () => {
    if (!newUser.prenom || !newUser.nom) { toast.error(`${t('settings.users.prenom')} / ${t('settings.users.nom')}`); return; }
    if (newUser.pin.length !== 4) { toast.error(t('settings.users.pin')); return; }
    if (newUser.pin !== newUser.confirmPin) { toast.error(t('settings.users.confirmPin')); return; }
    const colors = ['#A93200', '#00D4AA', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    await addUser({ prenom: newUser.prenom, nom: newUser.nom, role: newUser.role, pin: newUser.pin, color: colors[users.length % colors.length] });
    toast.success(t('settings.users.added'));
    setShowUserModal(false);
    setNewUser({ prenom: '', nom: '', role: 'caissier', pin: '', confirmPin: '' });
  };

  const handleChangePin = async () => {
    if (newPin.length !== 4) { toast.error(t('settings.users.pin')); return; }
    if (newPin !== confirmPin) { toast.error(t('settings.users.confirmPin')); return; }
    if (showPinModal) {
      await updateUserPin(showPinModal.id, newPin);
      toast.success(t('settings.users.pinUpdated'));
      setShowPinModal(null);
      setNewPin('');
      setConfirmPin('');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <h1 className="text-2xl nova-heading text-foreground mb-6">{t('settings.title')}</h1>

      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('boutique')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'boutique' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
          <Store className="w-4 h-4" /> {t('settings.tabs.boutique')}
        </button>
        <button onClick={() => setActiveTab('users')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'users' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
          <Users className="w-4 h-4" /> {t('settings.tabs.users')}
        </button>
      </div>

      {isBoutiqueTab && (
        <>
        <NovaCard accent className="w-full max-w-2xl">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.name')}</label>
              <input type="text" value={localShop.nom} onChange={e => setLocalShop({ ...localShop, nom: e.target.value })} className="nova-input w-full" />
            </div>
            {/* Address — auto-detected, manual as fallback */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted-foreground">{t('settings.boutique.address')}</label>
                <div className="flex items-center gap-2">
                  {addressPrecision && !isDetectingAddress && (
                    <span className={cn(
                      'text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1',
                      addressPrecision === 'gps'
                        ? 'bg-secondary/15 text-secondary'
                        : 'bg-amber-500/15 text-amber-500'
                    )}>
                      <LocateFixed className="w-2.5 h-2.5" />
                      {addressPrecision === 'gps'
                        ? t('settings.boutique.addressPrecisionGps')
                        : t('settings.boutique.addressPrecisionCity')}
                    </span>
                  )}
                  {!isDetectingAddress && (
                    <button
                      type="button"
                      onClick={runAddressDetection}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" />
                      {localShop.adresse
                        ? t('settings.boutique.addressRetry')
                        : t('settings.boutique.addressDetect')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowManualAddress(v => !v)}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <PenLine className="w-3 h-3" />
                    {t('settings.boutique.addressManual')}
                  </button>
                </div>
              </div>

              {isDetectingAddress ? (
                <div className="nova-input w-full flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" />
                  {localShop.adresse
                    ? <span className="truncate">{localShop.adresse}</span>
                    : <span>{t('settings.boutique.addressDetecting')}</span>}
                </div>
              ) : (
                <input
                  type="text"
                  value={localShop.adresse}
                  onChange={e => {
                    setLocalShop({ ...localShop, adresse: e.target.value });
                    setAddressPrecision(null);
                  }}
                  className="nova-input w-full"
                  placeholder={showManualAddress ? '' : t('settings.boutique.addressDetect')}
                  readOnly={!showManualAddress && !!localShop.adresse && !addressPrecision}
                  onClick={() => { if (!showManualAddress) setShowManualAddress(true); }}
                />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.phone')}</label>
                <input type="text" value={localShop.telephone} onChange={e => setLocalShop({ ...localShop, telephone: e.target.value })} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.email')}</label>
                <input type="email" value={localShop.email} onChange={e => setLocalShop({ ...localShop, email: e.target.value })} className="nova-input w-full" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.nui')}</label>
              <input type="text" value={localShop.nui} onChange={e => setLocalShop({ ...localShop, nui: e.target.value })} className="nova-input w-full" placeholder={t('settings.boutique.nui_hint')} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.header')}</label>
              <textarea value={localShop.enteteRecu} onChange={e => setLocalShop({ ...localShop, enteteRecu: e.target.value })} className="nova-input w-full h-20 resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.footer')}</label>
              <textarea value={localShop.piedPageRecu} onChange={e => setLocalShop({ ...localShop, piedPageRecu: e.target.value })} className="nova-input w-full h-20 resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.currency')}</label>
              <input type="text" value="FCFA" disabled className="nova-input w-full opacity-50" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.boutique.language')}</label>
              <select
                value={localShop.langue}
                onChange={e => setLocalShop({ ...localShop, langue: e.target.value as SupportedLocale })}
                className="nova-input w-full"
              >
                {ALL_LOCALES.map(l => (
                  <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
                ))}
              </select>
            </div>
            <button onClick={handleSaveShop} className="nova-btn-primary px-6 py-2.5">
              {t('settings.boutique.save')}
            </button>
          </div>
        </NovaCard>

        {/* Mobile Money codes */}
        <NovaCard accent className="w-full max-w-2xl mt-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t('settings.momo.title')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('settings.momo.subtitle')}</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.momo.mtnCode')}</label>
              <input
                type="text"
                value={localShop.momoMerchantCodeMtn ?? ''}
                onChange={e => setLocalShop({ ...localShop, momoMerchantCodeMtn: e.target.value })}
                className="nova-input w-full"
                placeholder="ex. 123456"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.momo.orangeCode')}</label>
              <input
                type="text"
                value={localShop.momoMerchantCodeOrange ?? ''}
                onChange={e => setLocalShop({ ...localShop, momoMerchantCodeOrange: e.target.value })}
                className="nova-input w-full"
                placeholder="ex. 654321"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.momo.hint')}</p>
            <button onClick={handleSaveShop} className="nova-btn-primary px-6 py-2.5">
              {t('settings.boutique.save')}
            </button>
          </div>
        </NovaCard>

        {/* Thermal printer */}
        <NovaCard accent className="w-full max-w-2xl mt-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t('settings.printer.title')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('settings.printer.subtitle')}</p>
              </div>
            </div>

            {!isThermalAvailable() ? (
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/60 px-3 py-2">
                {t('settings.printer.desktopOnly')}
              </p>
            ) : (
              <>
                {/* Printer selection */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.printer.nameLabel')}</label>
                  <select
                    value={localShop.printerName ?? ''}
                    onChange={e => setLocalShop({ ...localShop, printerName: e.target.value || undefined })}
                    className="nova-input w-full"
                  >
                    <option value="">{t('settings.printer.selectPlaceholder')}</option>
                    {printerList.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Paper width */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('settings.printer.widthLabel')}</p>
                  <div className="flex gap-3">
                    {(['58', '80'] as const).map(w => (
                      <label key={w} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="paperWidth"
                          value={w}
                          checked={localShop.paperWidth === w}
                          onChange={() => setLocalShop({ ...localShop, paperWidth: w })}
                          className="accent-primary"
                        />
                        <span className="text-sm">{w === '58' ? t('settings.printer.width58') : t('settings.printer.width80')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Toggles */}
                {[
                  { key: 'autoPrintOnSale' as const, label: 'settings.printer.autoPrint' },
                  { key: 'openDrawerOnSale' as const, label: 'settings.printer.openDrawer' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-foreground">{t(label)}</span>
                    <button
                      role="switch"
                      aria-checked={localShop[key]}
                      onClick={() => setLocalShop({ ...localShop, [key]: !localShop[key] })}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                        localShop[key] ? 'bg-primary' : 'bg-muted-foreground/30'
                      )}
                    >
                      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white transition-transform', localShop[key] ? 'translate-x-5' : 'translate-x-0.5')} />
                    </button>
                  </div>
                ))}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button onClick={handleSaveShop} className="nova-btn-primary px-6 py-2.5">
                    {t('settings.boutique.save')}
                  </button>
                  <button
                    onClick={handleTestPrint}
                    disabled={!localShop.printerName || isPrinterTesting}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isPrinterTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                    {t('settings.printer.testBtn')}
                  </button>
                </div>
              </>
            )}
          </div>
        </NovaCard>

        {/* Boutique code */}
        <NovaCard accent className="w-full max-w-2xl mt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">{t('settings.code.label')}</p>
              <p className="text-2xl font-mono font-bold text-foreground tracking-widest">{boutiqueCode}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {t('settings.code.hint')}
              </p>
            </div>
            <button
              onClick={handleCopyCode}
              className={cn(
                'shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                codeCopied
                  ? 'border-secondary/40 bg-secondary/10 text-secondary'
                  : 'border-border bg-muted text-foreground hover:bg-muted/80'
              )}
              aria-label={t('settings.code.copyAriaLabel')}
            >
              {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {codeCopied ? t('settings.code.copied') : t('settings.code.copy')}
            </button>
          </div>
        </NovaCard>

        <NovaCard accent className="w-full max-w-2xl mt-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Cloud className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t('settings.recovery.title')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('settings.recovery.subtitle')}</p>
              </div>
            </div>

            {!isLocalMode && (
              <div className="pt-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{t('settings.code.firebaseLabel')}</p>
                <p className="text-[11px] font-mono text-muted-foreground break-all bg-muted/40 rounded px-2 py-1.5 select-all">
                  {boutiqueId}
                </p>
              </div>
            )}

            {isLocalMode ? (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                {t('settings.recovery.noFirebase')}
              </p>
            ) : recoveryStatus?.isRecoveryEnabled ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-secondary/20 bg-secondary/10 px-3 py-2">
                  <p className="text-sm text-secondary font-medium">{t('settings.recovery.active')}</p>
                  <p className="text-xs text-muted-foreground mt-1 break-all">{recoveryStatus.email}</p>
                </div>
                <button
                  onClick={handleSendRecoveryReset}
                  className="flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted/80 transition-colors"
                >
                  <Mail className="w-4 h-4" /> {t('settings.recovery.sendReset')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.recovery.emailLabel')}</label>
                  <input type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} className="nova-input w-full" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('settings.recovery.passwordLabel')}</label>
                    <input type="password" value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)} className="nova-input w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('settings.recovery.confirmLabel')}</label>
                    <input type="password" value={recoveryPasswordConfirm} onChange={e => setRecoveryPasswordConfirm(e.target.value)} className="nova-input w-full" />
                  </div>
                </div>
                <button
                  onClick={handleEnableRecovery}
                  disabled={isRecoverySaving}
                  className="nova-btn-primary px-6 py-2.5 disabled:opacity-60"
                >
                  {isRecoverySaving ? t('settings.recovery.enabling') : t('settings.recovery.enable')}
                </button>
              </div>
            )}
          </div>
        </NovaCard>

        <NovaCard className="mt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">{t('settings.boutique.gpsShareTitle')}</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  {t('settings.boutique.gpsShareDesc')}
                </p>
              </div>
            </div>
            <button
              role="switch"
              aria-checked={geoConsentOn}
              onClick={() => {
                const next = !geoConsentOn;
                setGeoConsentOn(next);
                setGeoConsent(next);
                toast.success(next ? t('settings.boutique.gpsShareOn') : t('settings.boutique.gpsShareOff'));
              }}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                geoConsentOn ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                  geoConsentOn ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-muted/30 border border-border/40 space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground">{t('settings.boutique.geoTransparencyTitle')}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t('settings.boutique.geoTransparencyList')}</p>
            <p className="text-[11px] font-medium text-[#2B6954] mt-0.5">{t('settings.boutique.geoTransparencyNone')}</p>
          </div>
        </NovaCard>

        {/* ── Sauvegarde & restauration ──────────────────────────────────── */}
        <NovaCard accent className="w-full max-w-2xl mt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <HardDrive className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{t('settings.backup.title')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.backup.subtitle')}</p>
            </div>
          </div>

          {/* Backup reminder */}
          {backupReminderDays !== null && backupReminderDays >= 30 && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600">
                {t('settings.backup.reminderText').replace('{days}', String(backupReminderDays))}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { setShowExportModal(true); setExportPassword(''); setExportPassword2(''); }}
              className="nova-btn-primary flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Download className="w-4 h-4" />
              {t('settings.backup.exportBtn')}
            </button>
            <button
              onClick={() => importFileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-border bg-muted hover:bg-muted/80 text-foreground transition-colors"
            >
              <Upload className="w-4 h-4" />
              {t('settings.backup.importBtn')}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFileChange}
            />
          </div>

          <p className="text-[11px] text-muted-foreground mt-3">
            {t('settings.backup.usbHint')}
          </p>
        </NovaCard>
        </>
      )}

      {isUsersTab && (
        <div>
          <button onClick={() => setShowUserModal(true)} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5 mb-6">
            <Plus className="w-4 h-4" /> {t('settings.users.add')}
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(user => (
              <NovaCard key={user.id} accent className="flex flex-col items-center text-center">
                <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-lg flex items-center justify-center text-xl font-semibold text-white mb-3" style={{ backgroundColor: user.color }}>
                  {user.prenom[0]}{user.nom[0]}
                </div>
                <p className="font-medium text-foreground">{user.prenom} {user.nom}</p>
                <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium mt-2', user.role === 'gérant' ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary')}>
                  {user.role === 'gérant' ? t('common.gerant') : t('common.caissier')}
                </span>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  <button
                    onClick={() => { setEditUser(user); setEditUserInfo({ prenom: user.prenom, nom: user.nom, role: user.role }); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> {t('settings.users.edit')}
                  </button>
                  <button onClick={() => { setShowPinModal(user); setNewPin(''); setConfirmPin(''); }} className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> {t('settings.users.changePin')}
                  </button>
                  {users.filter(u => u.role === 'gérant').length > 1 || user.role !== 'gérant' ? (
                    <button onClick={() => setConfirmDeleteUser(user)} className="text-xs px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> {t('settings.users.delete')}
                    </button>
                  ) : null}
                </div>
              </NovaCard>
            ))}
          </div>
        </div>
      )}

      {/* Add user modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowUserModal(false)}>
          <div className="nova-card w-full max-w-[420px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">{t('settings.users.newUser')}</h2>
              <button onClick={() => setShowUserModal(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.prenom')} *</label>
                  <input type="text" value={newUser.prenom} onChange={e => setNewUser({ ...newUser, prenom: e.target.value })} className="nova-input w-full" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.nom')} *</label>
                  <input type="text" value={newUser.nom} onChange={e => setNewUser({ ...newUser, nom: e.target.value })} className="nova-input w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.role')}</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as 'gérant' | 'caissier' })} className="nova-input w-full">
                  <option value="caissier">{t('common.caissier')}</option>
                  <option value="gérant">{t('common.gerant')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.pin')} *</label>
                <input type="password" maxLength={4} value={newUser.pin} onChange={e => setNewUser({ ...newUser, pin: e.target.value.replace(/\D/g, '') })} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.confirmPin')} *</label>
                <input type="password" maxLength={4} value={newUser.confirmPin} onChange={e => setNewUser({ ...newUser, confirmPin: e.target.value.replace(/\D/g, '') })} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowUserModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('settings.users.cancel')}</button>
              <button onClick={handleAddUser} className="flex-1 nova-btn-primary py-2.5">{t('settings.users.add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
          <div className="nova-card w-full max-w-[420px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">{t('settings.users.editUser')}</h2>
              <button onClick={() => setEditUser(null)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.prenom')} *</label>
                  <input type="text" value={editUserInfo.prenom} onChange={e => setEditUserInfo({ ...editUserInfo, prenom: e.target.value })} className="nova-input w-full" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.nom')} *</label>
                  <input type="text" value={editUserInfo.nom} onChange={e => setEditUserInfo({ ...editUserInfo, nom: e.target.value })} className="nova-input w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.role')}</label>
                <select
                  value={editUserInfo.role}
                  onChange={e => setEditUserInfo({ ...editUserInfo, role: e.target.value as 'gérant' | 'caissier' })}
                  className="nova-input w-full"
                  disabled={editUser.role === 'gérant' && users.filter(u => u.role === 'gérant').length === 1}
                >
                  <option value="caissier">{t('common.caissier')}</option>
                  <option value="gérant">{t('common.gerant')}</option>
                </select>
                {editUser.role === 'gérant' && users.filter(u => u.role === 'gérant').length === 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1">{t('common.gerant')} — {t('settings.users.role')}</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditUser(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('settings.users.cancel')}</button>
              <button
                onClick={() => {
                  if (!editUserInfo.prenom.trim() || !editUserInfo.nom.trim()) { toast.error(`${t('settings.users.prenom')} / ${t('settings.users.nom')}`); return; }
                  updateUserInfo(editUser.id, editUserInfo);
                  toast.success(t('settings.users.updated'));
                  setEditUser(null);
                }}
                className="flex-1 nova-btn-primary py-2.5"
              >
                {t('settings.users.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete user confirmation modal */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteUser(null)}>
          <div className="nova-card w-full max-w-[380px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="nova-heading text-base text-foreground">{t('settings.users.deleteConfirm')}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{confirmDeleteUser.prenom} {confirmDeleteUser.nom}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              {t('settings.users.deleteWarning')}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteUser(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('settings.users.cancel')}</button>
              <button
                onClick={() => {
                  deleteUser(confirmDeleteUser.id);
                  toast.success(t('settings.users.deleted'));
                  setConfirmDeleteUser(null);
                }}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium"
              >
                {t('settings.users.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export backup modal ─────────────────────────────────────────── */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
          <div className="nova-card w-full max-w-[460px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="nova-heading text-lg text-foreground">{t('settings.backup.exportTitle')}</h2>
              <button onClick={() => setShowExportModal(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {/* Encrypt toggle */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 mb-4">
              <input
                id="exportEncrypt"
                type="checkbox"
                checked={exportEncrypt}
                onChange={e => setExportEncrypt(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded shrink-0"
              />
              <label htmlFor="exportEncrypt" className="cursor-pointer">
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {exportEncrypt ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <ShieldOff className="w-3.5 h-3.5 text-amber-400" />}
                  {t('settings.backup.encryptLabel')}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t('settings.backup.encryptHint')}</p>
              </label>
            </div>

            {exportEncrypt ? (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.backup.passwordLabel')}</label>
                  <input type="password" value={exportPassword} onChange={e => setExportPassword(e.target.value)} className="nova-input w-full" placeholder="••••••••" autoComplete="new-password" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('settings.backup.passwordConfirmLabel')}</label>
                  <input type="password" value={exportPassword2} onChange={e => setExportPassword2(e.target.value)} className="nova-input w-full" placeholder="••••••••" autoComplete="new-password" />
                </div>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-600">{t('settings.backup.passwordWarning')}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-600">{t('settings.backup.noEncryptWarning')}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowExportModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm">{t('common.cancel')}</button>
              <button onClick={handleExport} disabled={isExporting} className="flex-1 nova-btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isExporting ? t('settings.backup.exporting') : t('settings.backup.exportBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import: password modal ───────────────────────────────────────── */}
      {showImportPassword && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowImportPassword(false)}>
          <div className="nova-card w-full max-w-[400px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="nova-heading text-base text-foreground">{t('settings.backup.decryptTitle')}</h2>
              <button onClick={() => setShowImportPassword(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            {pendingMeta && (
              <p className="text-xs text-muted-foreground mb-3">
                {t('settings.backup.exportedAt')}: {new Date(pendingMeta.exportedAt).toLocaleString()}
              </p>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('settings.backup.passwordLabel')}</label>
              <input
                type="password"
                value={importPassword}
                onChange={e => setImportPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleImportWithPassword()}
                className="nova-input w-full"
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowImportPassword(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm">{t('common.cancel')}</button>
              <button onClick={handleImportWithPassword} className="flex-1 nova-btn-primary py-2.5 text-sm">{t('settings.backup.decryptBtn')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import: confirm restore modal ────────────────────────────────── */}
      {showImportConfirm && pendingData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="nova-card w-full max-w-[460px] p-5 lg:p-6 animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="nova-heading text-base text-foreground">{t('settings.backup.confirmTitle')}</h2>
                {pendingMeta && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('settings.backup.exportedAt')}: {new Date(pendingMeta.exportedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Cross-boutique warning */}
            {pendingMeta && pendingMeta.boutiqueId !== boutiqueId && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{t('settings.backup.crossBoutiqueWarning')}</p>
              </div>
            )}

            {/* Data summary */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              {[
                ['settings.backup.sumProducts', pendingData.products.length],
                ['settings.backup.sumSales',    pendingData.sales.length],
                ['settings.backup.sumCustomers',pendingData.customers.length],
                ['settings.backup.sumUsers',    pendingData.users.length],
              ].map(([key, val]) => (
                <div key={String(key)} className="p-2 rounded-lg bg-muted/40 flex justify-between">
                  <span className="text-muted-foreground">{t(String(key) as Parameters<typeof t>[0])}</span>
                  <span className="font-semibold text-foreground">{val}</span>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground mb-5">{t('settings.backup.confirmWarning')}</p>

            {isRestoring && restoreProgress && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{t('settings.backup.restoring')}</span>
                  <span>{restoreProgress.done}/{restoreProgress.total}</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.round(restoreProgress.done / restoreProgress.total * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowImportConfirm(false); setPendingData(null); setPendingMeta(null); }}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRestore}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                {isRestoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {isRestoring ? t('settings.backup.restoring') : t('settings.backup.restoreBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change PIN modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPinModal(null)}>
          <div className="nova-card w-full max-w-[380px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <h2 className="nova-heading text-lg text-foreground mb-6">{t('settings.users.changeUserPin')} — {showPinModal.prenom}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.newPin')}</label>
                <input type="password" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('settings.users.confirm')}</label>
                <input type="password" maxLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPinModal(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">{t('settings.users.cancel')}</button>
              <button onClick={handleChangePin} className="flex-1 nova-btn-primary py-2.5">{t('settings.users.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParametresPage;