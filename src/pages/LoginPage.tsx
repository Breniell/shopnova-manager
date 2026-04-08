import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '@/stores/useAuthStore';
import { ArrowLeft, Shield, ShoppingCart, BarChart3, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

const LoginPage: React.FC = () => {
  const { users, login } = useAuthStore();
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
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
    setPin('');
    setError(false);
    setLocked(false);
    if (lockTimerRef.current) clearInterval(lockTimerRef.current);
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
        navigate('/');
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
    { icon: ShoppingCart, label: 'Point de vente rapide et intuitif' },
    { icon: BarChart3, label: 'Rapports et statistiques en temps réel' },
    { icon: Shield, label: 'Gestion sécurisée par code PIN' },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      <div className="login-mesh-bg">
        <div className="mesh-3" />
      </div>

      <div className="hidden lg:flex w-[40%] flex-col justify-center items-center relative z-10 p-12">
        <div className="max-w-sm">
          <div className="flex items-center gap-grid mb-8">
            <svg viewBox="0 0 40 40" className="w-12 h-12">
              <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#A93200" strokeWidth="2" />
              <path d="M20,12 L20,28 M16,20 L20,12 L24,20" stroke="#A93200" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <div>
              <h1 className="text-display-md font-bold text-foreground tracking-tight">Legwan</h1>
              <p className="text-sm text-muted-foreground">La gestion, réinventée.</p>
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
          {!selectedUser ? (
            <>
              <h2 className="nova-heading text-title-lg text-foreground mb-2">Connexion</h2>
              <p className="text-sm text-muted-foreground mb-8">Sélectionnez votre profil</p>

              <div className="grid grid-cols-1 gap-grid">
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-all duration-150 text-left group"
                  >
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-base font-semibold text-white shrink-0 transition-transform duration-150 group-hover:scale-105"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.prenom[0]}{user.nom[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{user.prenom} {user.nom}</p>
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-1',
                        user.role === 'gérant'
                          ? 'bg-primary/20 text-primary'
                          : 'bg-secondary/20 text-secondary'
                      )}>
                        {user.role === 'gérant' ? 'Gérant' : 'Caissier'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="animate-fade-in">
              <button onClick={handleBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>

              <div className="text-center mb-8">
                <div
                  className="w-16 h-16 rounded-lg flex items-center justify-center text-title-lg font-semibold text-white mx-auto mb-4"
                  style={{ backgroundColor: selectedUser.color }}
                >
                  {selectedUser.prenom[0]}{selectedUser.nom[0]}
                </div>
                <p className="font-medium text-foreground text-lg">{selectedUser.prenom} {selectedUser.nom}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {locked ? '' : 'Entrez votre code PIN'}
                </p>
              </div>

              {locked && (
                <div className="text-center mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in">
                  <Lock className="w-6 h-6 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-destructive font-medium">Compte bloqué</p>
                  <p className="text-sm text-destructive/80 mt-1">Réessayez dans {formatLockTime(remainingSeconds)}</p>
                </div>
              )}

              {!locked && (
                <>
                  <div className={cn('flex justify-center gap-4 mb-8', error && 'pin-shake')}>
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className={cn(
                          'w-4 h-4 rounded-full transition-all duration-150',
                          i < pin.length
                            ? error ? 'bg-destructive scale-110' : 'bg-primary scale-110'
                            : 'bg-muted-foreground/30'
                        )}
                      />
                    ))}
                  </div>

                  {error && (
                    <p className="text-center text-sm text-destructive mb-4 animate-fade-in">Code PIN incorrect</p>
                  )}

                  <div className="grid grid-cols-3 gap-grid max-w-[240px] mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((key, i) => {
                      if (key === '') return <div key={i} />;
                      return (
                        <button
                          key={i}
                          onClick={() => key === '←' ? handleBackspace() : handlePinDigit(key)}
                          disabled={isLoggingIn}
                          className="w-16 h-16 rounded-xl bg-muted border border-border text-foreground text-title-lg font-medium hover:bg-muted/80 active:scale-95 transition-all duration-100 mx-auto flex items-center justify-center disabled:opacity-50"
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
