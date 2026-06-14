import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '@/stores/useAuthStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import { ArrowLeft, Shield, ShoppingCart, BarChart3, Lock, Cloud, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  getBoutiqueRecoveryErrorMessage,
  getSavedRecoveryEmail,
  sendBoutiqueRecoveryPasswordReset,
  signInBoutiqueRecoveryAccount,
} from '@/services/boutiqueService';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { users, login } = useAuthStore();
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState(getSavedRecoveryEmail());
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    };
  }, []);

  const startLockTimer = (seconds: number) => {
    setLocked(true);
    setRemainingSeconds(seconds);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
    lockTimerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(lockTimerRef.current!);
          setLocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setPin('');
    setError(false);
    setLocked(false);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
  };

  const handleBack = () => {
    setSelectedUser(null);
    setShowRecovery(false);
    setPin('');
    setError(false);
    setLocked(false);
    setRecoveryError(null);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
  };

  const handleRecoverySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryError(null);
    setResetSent(false);

    if (!recoveryEmail.trim() || !recoveryPassword) {
      setRecoveryError(t('login.email') + ' / ' + t('login.password'));
      return;
    }

    setIsRecovering(true);
    try {
      await signInBoutiqueRecoveryAccount(recoveryEmail, recoveryPassword);
      toast.success(t('login.restoreBtn') + '…');
      window.setTimeout(() => window.location.reload(), 350);
    } catch (err) {
      setRecoveryError(getBoutiqueRecoveryErrorMessage(err));
    } finally {
      setIsRecovering(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!recoveryEmail.trim()) {
      setRecoveryError(t('login.email'));
      return;
    }

    setRecoveryError(null);
    setResetSent(false);
    try {
      await sendBoutiqueRecoveryPasswordReset(recoveryEmail);
      setResetSent(true);
    } catch (err) {
      setRecoveryError(getBoutiqueRecoveryErrorMessage(err));
    }
  };

  const handlePinDigit = useCallback(async (digit: string) => {
    if (pin.length >= 4 || isLoggingIn || locked) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);

    if (newPin.length === 4 && selectedUser) {
      setIsLoggingIn(true);
      const result = await login(selectedUser.id, newPin);
      if (result.success) {
        // Cas caissier : vérifier qu'il a une session active, sinon le rediriger
        // vers la page d'ouverture pour déclarer son fond de caisse.
        // Le gérant n'a pas besoin de session pour faire du back-office.
        if (selectedUser.role === 'caissier') {
          const open = useCashSessionStore.getState().getOpenSessionForUser(selectedUser.id);
          if (open) {
            useCashSessionStore.getState()._setCurrentSessionId(open.id);
            navigate('/caisse');
          } else {
            navigate('/ouverture-session');
          }
        } else {
          // Gérant : on restaure quand même la session s'il en avait une ouverte
          const open = useCashSessionStore.getState().getOpenSessionForUser(selectedUser.id);
          if (open) {
            useCashSessionStore.getState()._setCurrentSessionId(open.id);
          }
          navigate('/');
        }
      } else if (result.locked && result.remainingSeconds) {
        startLockTimer(result.remainingSeconds);
        setPin('');
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 600);
      }
      setIsLoggingIn(false);
    }
  }, [pin, selectedUser, login, navigate, isLoggingIn, locked]);

  const handleBackspace = () => {
    if (locked) return;
    setPin(p => p.slice(0, -1));
    setError(false);
  };

  // Keyboard support for PIN entry — placed after handlePinDigit/handleBackspace to avoid TDZ
  useEffect(() => {
    if (!selectedUser) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        handleBackspace();
      } else if (/^[0-9]$/.test(e.key)) {
        handlePinDigit(e.key);
      } else if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedUser, handlePinDigit]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatLockTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const features = [
    { icon: ShoppingCart, label: t('dashboard.feature1') },
    { icon: BarChart3, label: t('dashboard.feature2') },
    { icon: Shield, label: t('dashboard.feature3') },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      <div className="login-mesh-bg">
        <div className="mesh-3" />
      </div>

      <div className="hidden lg:flex w-[40%] flex-col justify-center items-center relative z-10 p-12">
        <div className="max-w-sm">
          <div className="flex items-center gap-grid mb-8">
            <svg viewBox="0 0 80 80" className="w-12 h-12" fill="none">
              <rect width="80" height="80" rx="18" fill="#A93200"/>
              <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="20" y1="13" x2="20" y2="60" stroke="white" strokeWidth="5" strokeLinecap="round"/>
              <line x1="20" y1="60" x2="34" y2="60" stroke="white" strokeWidth="5" strokeLinecap="round"/>
            </svg>
            <div>
              <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Legwan</h1>
              <p className="text-sm text-muted-foreground">{t('dashboard.taglinePunct')}</p>
            </div>
          </div>

          <div className="space-y-6 mt-12">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10 p-8">
        <div className="w-full max-w-md nova-card p-8 backdrop-blur-xl bg-card/80">
          {showRecovery ? (
            <div className="animate-fade-in">
              <button onClick={handleBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
                <ArrowLeft className="w-4 h-4" /> {t('login.back')}
              </button>

              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="nova-heading text-lg text-foreground">{t('login.restoreTitle')}</h2>
                  <p className="text-sm text-muted-foreground">{t('login.restoreSubtitle')}</p>
                </div>
              </div>

              <form onSubmit={handleRecoverySubmit} className="space-y-4 mt-6">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('login.email')}</label>
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={e => setRecoveryEmail(e.target.value)}
                    className="nova-input w-full"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('login.password')}</label>
                  <input
                    type="password"
                    value={recoveryPassword}
                    onChange={e => setRecoveryPassword(e.target.value)}
                    className="nova-input w-full"
                    autoComplete="current-password"
                  />
                </div>

                {recoveryError && (
                  <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                    {recoveryError}
                  </p>
                )}

                {resetSent && (
                  <p className="text-sm text-secondary rounded-lg bg-secondary/10 border border-secondary/20 px-3 py-2">
                    {t('login.resetSent')}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isRecovering}
                  className="nova-btn-primary w-full py-2.5 disabled:opacity-60"
                >
                  {isRecovering ? t('common.loading') : t('login.restoreBtn')}
                </button>
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="w-full py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" /> {t('login.forgotPassword')}
                </button>
              </form>
            </div>
          ) : !selectedUser ? (
            <>
              <h2 className="nova-heading text-xl text-foreground mb-2">{t('login.title')}</h2>
              <p className="text-sm text-muted-foreground mb-8">{t('login.subtitle')}</p>

              <div className="grid grid-cols-1 gap-grid">
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-all duration-150 text-left group"
                    style={{ minHeight: '72px' }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0 transition-transform duration-150 group-hover:scale-105"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.prenom[0]}{user.nom[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-semibold text-foreground">{user.prenom} {user.nom}</p>
                      <p className={cn(
                        'text-[13px] font-medium mt-0.5',
                        user.role === 'gérant' ? 'text-primary' : 'text-secondary'
                      )}>
                        {user.role === 'gérant' ? t('login.role.gerant') : t('login.role.caissier')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {isFirebaseConfigured && (
                <div className="mt-6 pt-6 border-t border-border/60">
                  <button
                    onClick={() => {
                      setShowRecovery(true);
                      setRecoveryError(null);
                      setResetSent(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors"
                  >
                    <Cloud className="w-4 h-4" /> {t('login.restore')}
                  </button>
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    {t('login.restoreHint')}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="animate-fade-in">
              <button onClick={handleBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
                <ArrowLeft className="w-4 h-4" /> {t('login.back')}
              </button>

              <div className="text-center mb-8">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white mx-auto mb-4"
                  style={{ backgroundColor: selectedUser.color }}
                >
                  {selectedUser.prenom[0]}{selectedUser.nom[0]}
                </div>
                <p className="font-medium text-foreground text-lg">{selectedUser.prenom} {selectedUser.nom}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {locked ? '' : t('login.enterPin')}
                </p>
              </div>

              {locked && (
                <div className="text-center mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in">
                  <Lock className="w-6 h-6 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-destructive font-medium">{t('login.locked')}</p>
                  <p className="text-sm text-destructive/80 mt-1">{t('login.retryIn')} {formatLockTime(remainingSeconds)}</p>
                </div>
              )}

              {!locked && (
                <>
                  <div className={cn('flex justify-center gap-4 mb-8', error && 'pin-shake')}>
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className={cn(
                          'w-[14px] h-[14px] rounded-full transition-all duration-150',
                          i < pin.length
                            ? error ? 'bg-destructive scale-110' : 'bg-primary scale-110'
                            : 'bg-muted-foreground/30'
                        )}
                      />
                    ))}
                  </div>

                  {error && (
                    <p className="text-center text-sm text-destructive mb-4 animate-fade-in">{t('login.wrongPin')}</p>
                  )}

                  <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((key, i) => {
                      if (key === '') return <div key={i} />;
                      return (
                        <button
                          key={i}
                          onClick={() => key === '←' ? handleBackspace() : handlePinDigit(key)}
                          disabled={isLoggingIn}
                          className="w-[64px] h-[64px] rounded-xl bg-muted border border-border text-foreground text-xl font-semibold hover:bg-primary/10 hover:border-primary/30 active:scale-95 transition-all duration-100 mx-auto flex items-center justify-center disabled:opacity-50"
                        >
                          {key}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
