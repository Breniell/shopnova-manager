import React, { useState } from 'react';
import { useSuperAdminStore } from '@/stores/useSuperAdminStore';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';

export const SALogin: React.FC = () => {
  const { login, loading, error, clearError } = useSuperAdminStore();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    login(email, password);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background mesh */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(169,50,0,0.08)_0%,_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(43,105,84,0.06)_0%,_transparent_60%)]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo + title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-lg">
            <svg width="36" height="36" viewBox="0 0 80 80" fill="none">
              <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="20" y1="13" x2="20" y2="60" stroke="white" strokeWidth="6" strokeLinecap="round"/>
              <line x1="20" y1="60" x2="34" y2="60" stroke="white" strokeWidth="6" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">{t('superadmin.loginTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('superadmin.loginSubtitle')}</p>
        </div>

        {/* Login card */}
        <div className="nova-card p-6">
          <div className="flex items-center gap-2 mb-5 p-3 rounded-lg bg-primary/8 border border-primary/20">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              {t('superadmin.loginNote')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('superadmin.loginEmailLabel')}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="nova-input w-full"
                placeholder={import.meta.env.VITE_SUPERADMIN_EMAIL ?? 'admin@exemple.com'}
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('superadmin.loginPasswordLabel')}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="nova-input w-full pr-10"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('superadmin.loginPasswordAria')}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className={cn(
                'nova-btn-primary w-full py-3 flex items-center justify-center gap-2',
                (loading || !email || !password) && 'opacity-60 cursor-not-allowed'
              )}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('superadmin.loginConnecting')}</>
              ) : (
                t('superadmin.loginButton')
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          {t('superadmin.loginFooter')}
        </p>
      </div>
    </div>
  );
};
