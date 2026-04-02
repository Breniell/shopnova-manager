import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, User } from '@/stores/useAuthStore';
import { ArrowLeft, Shield, ShoppingCart, Zap, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const LoginPage: React.FC = () => {
  const { users, login } = useAuthStore();
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    setPin('');
    setError(false);
  };

  const handleBack = () => {
    setSelectedUser(null);
    setPin('');
    setError(false);
  };

  const handlePinDigit = useCallback((digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);

    if (newPin.length === 4 && selectedUser) {
      const success = login(selectedUser.id, newPin);
      if (success) {
        navigate('/');
      } else {
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 600);
      }
    }
  }, [pin, selectedUser, login, navigate]);

  const handleBackspace = () => {
    setPin(p => p.slice(0, -1));
    setError(false);
  };

  const features = [
    { icon: ShoppingCart, label: 'Point de vente rapide et intuitif' },
    { icon: BarChart3, label: 'Rapports et statistiques en temps réel' },
    { icon: Shield, label: 'Gestion sécurisée par code PIN' },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Animated mesh background */}
      <div className="login-mesh-bg">
        <div className="mesh-3" />
      </div>

      {/* Left branding panel */}
      <div className="hidden lg:flex w-[40%] flex-col justify-center items-center relative z-10 p-12">
        <div className="max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <svg viewBox="0 0 40 40" className="w-12 h-12">
              <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#6C63FF" strokeWidth="2" />
              <path d="M20,12 L20,28 M16,20 L20,12 L24,20" stroke="#6C63FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <div>
              <h1 className="text-3xl font-bold text-foreground tracking-tight">ShopNova</h1>
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

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center relative z-10 p-8">
        <div className="w-full max-w-md nova-card p-8 backdrop-blur-xl bg-card/80">
          {!selectedUser ? (
            <>
              <h2 className="nova-heading text-xl text-foreground mb-2">Connexion</h2>
              <p className="text-sm text-muted-foreground mb-8">Sélectionnez votre profil</p>
              
              <div className="grid grid-cols-1 gap-3">
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-all duration-150 text-left group"
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold text-white shrink-0 transition-transform duration-150 group-hover:scale-105"
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
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold text-white mx-auto mb-4"
                  style={{ backgroundColor: selectedUser.color }}
                >
                  {selectedUser.prenom[0]}{selectedUser.nom[0]}
                </div>
                <p className="font-medium text-foreground text-lg">{selectedUser.prenom} {selectedUser.nom}</p>
                <p className="text-sm text-muted-foreground mt-1">Entrez votre code PIN</p>
              </div>

              {/* PIN dots */}
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

              {/* PIN pad */}
              <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '←'].map((key, i) => {
                  if (key === '') return <div key={i} />;
                  return (
                    <button
                      key={i}
                      onClick={() => key === '←' ? handleBackspace() : handlePinDigit(key)}
                      className="w-16 h-16 rounded-xl bg-muted border border-border text-foreground text-xl font-medium hover:bg-muted/80 active:scale-95 transition-all duration-100 mx-auto flex items-center justify-center"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
