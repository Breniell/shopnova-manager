import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore, User } from '@/stores/useAuthStore';
import { NovaCard } from '@/components/ui/NovaCard';
import { cn } from '@/lib/utils';
import { Store, Users, KeyRound, Trash2, Plus, X, Copy, Check, Cloud, Mail, Pencil } from 'lucide-react';
import { toast } from 'sonner';
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
  const [activeTab, setActiveTab] = useState<'boutique' | 'users'>('boutique');
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
    if (!recoveryEmail.trim()) { toast.error('Email requis'); return; }
    if (recoveryPassword.length < 6) { toast.error('Mot de passe: 6 caracteres minimum'); return; }
    if (recoveryPassword !== recoveryPasswordConfirm) { toast.error('Les mots de passe ne correspondent pas'); return; }

    setIsRecoverySaving(true);
    try {
      await linkBoutiqueRecoveryAccount(recoveryEmail, recoveryPassword);
      setRecoveryPassword('');
      setRecoveryPasswordConfirm('');
      await refreshRecoveryStatus();
      toast.success('Recuperation cloud activee');
    } catch (err) {
      toast.error(getBoutiqueRecoveryErrorMessage(err));
    } finally {
      setIsRecoverySaving(false);
    }
  };

  const handleSendRecoveryReset = async () => {
    if (!recoveryEmail.trim()) { toast.error('Email requis'); return; }
    try {
      await sendBoutiqueRecoveryPasswordReset(recoveryEmail);
      toast.success('Email de reinitialisation envoye');
    } catch (err) {
      toast.error(getBoutiqueRecoveryErrorMessage(err));
    }
  };

  const handleSaveShop = () => {
    updateShop(localShop);
    toast.success('Paramètres enregistrés');
  };

  const handleAddUser = async () => {
    if (!newUser.prenom || !newUser.nom) { toast.error('Prénom et nom requis'); return; }
    if (newUser.pin.length !== 4) { toast.error('Le PIN doit contenir 4 chiffres'); return; }
    if (newUser.pin !== newUser.confirmPin) { toast.error('Les PINs ne correspondent pas'); return; }
    const colors = ['#A93200', '#00D4AA', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
    await addUser({ prenom: newUser.prenom, nom: newUser.nom, role: newUser.role, pin: newUser.pin, color: colors[users.length % colors.length] });
    toast.success('Utilisateur ajouté');
    setShowUserModal(false);
    setNewUser({ prenom: '', nom: '', role: 'caissier', pin: '', confirmPin: '' });
  };

  const handleChangePin = async () => {
    if (newPin.length !== 4) { toast.error('Le PIN doit contenir 4 chiffres'); return; }
    if (newPin !== confirmPin) { toast.error('Les PINs ne correspondent pas'); return; }
    if (showPinModal) {
      await updateUserPin(showPinModal.id, newPin);
      toast.success('PIN mis à jour');
      setShowPinModal(null);
      setNewPin('');
      setConfirmPin('');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
      <h1 className="text-headline-lg nova-heading text-foreground mb-6">Paramètres</h1>

      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('boutique')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'boutique' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
          <Store className="w-4 h-4" /> Boutique
        </button>
        <button onClick={() => setActiveTab('users')} className={cn('px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2', activeTab === 'users' ? 'bg-card text-foreground' : 'text-muted-foreground')}>
          <Users className="w-4 h-4" /> Utilisateurs
        </button>
      </div>

      {isBoutiqueTab && (
        <>
        <NovaCard accent className="w-full max-w-2xl">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nom de la boutique</label>
              <input type="text" value={localShop.nom} onChange={e => setLocalShop({ ...localShop, nom: e.target.value })} className="nova-input w-full" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Adresse</label>
              <input type="text" value={localShop.adresse} onChange={e => setLocalShop({ ...localShop, adresse: e.target.value })} className="nova-input w-full" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Téléphone</label>
                <input type="text" value={localShop.telephone} onChange={e => setLocalShop({ ...localShop, telephone: e.target.value })} className="nova-input w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Email (optionnel)</label>
                <input type="email" value={localShop.email} onChange={e => setLocalShop({ ...localShop, email: e.target.value })} className="nova-input w-full" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">NUI (optionnel)</label>
              <input type="text" value={localShop.nui} onChange={e => setLocalShop({ ...localShop, nui: e.target.value })} className="nova-input w-full" placeholder="Numéro Unique d'Identification" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">En-tête du reçu</label>
              <textarea value={localShop.enteteRecu} onChange={e => setLocalShop({ ...localShop, enteteRecu: e.target.value })} className="nova-input w-full h-20 resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pied de page du reçu</label>
              <textarea value={localShop.piedPageRecu} onChange={e => setLocalShop({ ...localShop, piedPageRecu: e.target.value })} className="nova-input w-full h-20 resize-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Devise</label>
              <input type="text" value="FCFA" disabled className="nova-input w-full opacity-50" />
            </div>
            <button onClick={handleSaveShop} className="nova-btn-primary px-6 py-2.5">Enregistrer</button>
          </div>
        </NovaCard>

        {/* Boutique code */}
        <NovaCard accent className="w-full max-w-2xl mt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Code boutique</p>
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
              {codeCopied ? 'Copié !' : 'Copier ID'}
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
                <p className="text-sm font-semibold text-foreground">Sauvegarde et recuperation cloud</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Liez cette boutique a un email et un mot de passe. En cas de machine perdue, reinstallez Legwan puis restaurez depuis l ecran de connexion.
                </p>
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
                Firebase n est pas configure: la recuperation cloud est inactive dans ce build.
              </p>
            ) : recoveryStatus?.isRecoveryEnabled ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-secondary/20 bg-secondary/10 px-3 py-2">
                  <p className="text-sm text-secondary font-medium">Recuperation active</p>
                  <p className="text-xs text-muted-foreground mt-1 break-all">{recoveryStatus.email}</p>
                </div>
                <button
                  onClick={handleSendRecoveryReset}
                  className="flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted/80 transition-colors"
                >
                  <Mail className="w-4 h-4" /> Envoyer un email de reinitialisation
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Email proprietaire</label>
                  <input type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} className="nova-input w-full" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Mot de passe</label>
                    <input type="password" value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)} className="nova-input w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Confirmation</label>
                    <input type="password" value={recoveryPasswordConfirm} onChange={e => setRecoveryPasswordConfirm(e.target.value)} className="nova-input w-full" />
                  </div>
                </div>
                <button
                  onClick={handleEnableRecovery}
                  disabled={isRecoverySaving}
                  className="nova-btn-primary px-6 py-2.5 disabled:opacity-60"
                >
                  {isRecoverySaving ? 'Activation...' : 'Activer la recuperation'}
                </button>
              </div>
            )}
          </div>
        </NovaCard>
        </>
      )}

      {isUsersTab && (
        <div>
          <button onClick={() => setShowUserModal(true)} className="nova-btn-primary flex items-center gap-2 px-5 py-2.5 mb-6">
            <Plus className="w-4 h-4" /> Ajouter un utilisateur
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(user => (
              <NovaCard key={user.id} accent className="flex flex-col items-center text-center">
                <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-lg flex items-center justify-center text-title-lg font-semibold text-white mb-3" style={{ backgroundColor: user.color }}>
                  {user.prenom[0]}{user.nom[0]}
                </div>
                <p className="font-medium text-foreground">{user.prenom} {user.nom}</p>
                <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium mt-2', user.role === 'gérant' ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary')}>
                  {user.role === 'gérant' ? 'Gérant' : 'Caissier'}
                </span>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  <button
                    onClick={() => { setEditUser(user); setEditUserInfo({ prenom: user.prenom, nom: user.nom, role: user.role }); }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Modifier
                  </button>
                  <button onClick={() => { setShowPinModal(user); setNewPin(''); setConfirmPin(''); }} className="text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> PIN
                  </button>
                  {users.filter(u => u.role === 'gérant').length > 1 || user.role !== 'gérant' ? (
                    <button onClick={() => setConfirmDeleteUser(user)} className="text-xs px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Supprimer
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
              <h2 className="nova-heading text-lg text-foreground">Nouvel utilisateur</h2>
              <button onClick={() => setShowUserModal(false)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Prénom *</label>
                  <input type="text" value={newUser.prenom} onChange={e => setNewUser({ ...newUser, prenom: e.target.value })} className="nova-input w-full" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
                  <input type="text" value={newUser.nom} onChange={e => setNewUser({ ...newUser, nom: e.target.value })} className="nova-input w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rôle</label>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value as 'gérant' | 'caissier' })} className="nova-input w-full">
                  <option value="caissier">Caissier</option>
                  <option value="gérant">Gérant</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Code PIN (4 chiffres) *</label>
                <input type="password" maxLength={4} value={newUser.pin} onChange={e => setNewUser({ ...newUser, pin: e.target.value.replace(/\D/g, '') })} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Confirmer PIN *</label>
                <input type="password" maxLength={4} value={newUser.confirmPin} onChange={e => setNewUser({ ...newUser, confirmPin: e.target.value.replace(/\D/g, '') })} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowUserModal(false)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button onClick={handleAddUser} className="flex-1 nova-btn-primary py-2.5">Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
          <div className="nova-card w-full max-w-[420px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="nova-heading text-lg text-foreground">Modifier l'utilisateur</h2>
              <button onClick={() => setEditUser(null)} className="p-2 rounded-lg hover:bg-muted"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Prénom *</label>
                  <input type="text" value={editUserInfo.prenom} onChange={e => setEditUserInfo({ ...editUserInfo, prenom: e.target.value })} className="nova-input w-full" autoFocus />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nom *</label>
                  <input type="text" value={editUserInfo.nom} onChange={e => setEditUserInfo({ ...editUserInfo, nom: e.target.value })} className="nova-input w-full" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rôle</label>
                <select
                  value={editUserInfo.role}
                  onChange={e => setEditUserInfo({ ...editUserInfo, role: e.target.value as 'gérant' | 'caissier' })}
                  className="nova-input w-full"
                  disabled={editUser.role === 'gérant' && users.filter(u => u.role === 'gérant').length === 1}
                >
                  <option value="caissier">Caissier</option>
                  <option value="gérant">Gérant</option>
                </select>
                {editUser.role === 'gérant' && users.filter(u => u.role === 'gérant').length === 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1">Impossible de changer le rôle du dernier gérant.</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditUser(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button
                onClick={() => {
                  if (!editUserInfo.prenom.trim() || !editUserInfo.nom.trim()) { toast.error('Prénom et nom requis'); return; }
                  updateUserInfo(editUser.id, editUserInfo);
                  toast.success('Utilisateur mis à jour');
                  setEditUser(null);
                }}
                className="flex-1 nova-btn-primary py-2.5"
              >
                Enregistrer
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
                <h2 className="nova-heading text-base text-foreground">Supprimer l'utilisateur</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{confirmDeleteUser.prenom} {confirmDeleteUser.nom}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Cette action est irréversible. L'utilisateur ne pourra plus se connecter à Legwan.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteUser(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button
                onClick={() => {
                  deleteUser(confirmDeleteUser.id);
                  toast.success('Utilisateur supprimé');
                  setConfirmDeleteUser(null);
                }}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change PIN modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowPinModal(null)}>
          <div className="nova-card w-full max-w-[380px] p-5 lg:p-6 animate-scale-in" onClick={e => e.stopPropagation()}>
            <h2 className="nova-heading text-lg text-foreground mb-6">Changer le PIN — {showPinModal.prenom}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nouveau PIN</label>
                <input type="password" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Confirmer</label>
                <input type="password" maxLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} className="nova-input w-full text-center tracking-[1em] text-lg" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPinModal(null)} className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">Annuler</button>
              <button onClick={handleChangePin} className="flex-1 nova-btn-primary py-2.5">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParametresPage;
