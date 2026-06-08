import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore, User } from '@/stores/useAuthStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { cn } from '@/lib/utils';
import { Store, Users, KeyRound, Trash2, Plus, X, Copy, Check, Cloud, Mail, Pencil, MapPin, LocateFixed, Loader2, PenLine } from 'lucide-react';
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

  // Address geo-detection
  const [isDetectingAddress, setIsDetectingAddress] = useState(false);
  const [addressPrecision, setAddressPrecision] = useState<LocationPrecision | null>(null);
  const [showManualAddress, setShowManualAddress] = useState(false);

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

  const handleCopyCode = () => {
    navigator.clipboard.writeText(boutiqueId).then(() => {
      setCodeCopied(true);
      toast.success('Identifiant boutique copié');
      setTimeout(() => setCodeCopied(false), 2000);
    });
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
      <h1 className="text-headline-lg nova-heading text-foreground mb-6">{t('settings.title')}</h1>

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

        {/* Boutique code */}
        <NovaCard accent className="w-full max-w-2xl mt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">{t('settings.code.label')}</p>
              <p className="text-2xl font-mono font-bold text-foreground tracking-widest">{boutiqueCode}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Code court pour identifier la boutique. Pour restaurer sur une autre machine, activez le compte cloud ci-dessous.
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
              aria-label="Copier l'identifiant complet"
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Identifiant complet Firebase</p>
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
                <p className="font-medium text-foreground text-sm">Partage de la position</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Autorise l'envoi de la position géographique de votre boutique à l'éditeur,
                  pour le support et le suivi du service. Facultatif — désactivable à tout moment.
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
                toast.success(next ? 'Partage de la position activé' : 'Partage de la position désactivé');
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
                <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-lg flex items-center justify-center text-title-lg font-semibold text-white mb-3" style={{ backgroundColor: user.color }}>
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