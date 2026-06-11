/**
 * Console Super-Admin Legwan
 *
 * Route: /superadmin (hidden — not linked from sidebar)
 * Auth: email/password via secondary Firebase app (saAuth)
 * Access: breniellkouda@gmail.com uniquement
 *         (source de vérité : firestore.rules + SUPERADMIN_EMAIL dans useSuperAdminStore.ts —
 *          les deux DOIVENT rester identiques)
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSuperAdminStore } from '@/stores/useSuperAdminStore';
import { SALogin } from './SALogin';
import { SAOverview } from './SAOverview';
import { SABoutiqueTable } from './SABoutiqueTable';
import { SAMap } from './SAMap';
import { SAAnalytics } from './SAAnalytics';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  LayoutDashboard, Map, List, RefreshCw, LogOut,
  Loader2, AlertTriangle, BarChart2, Store,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';

type Tab = 'overview' | 'boutiques' | 'map' | 'analytics';

const AUTO_REFRESH_MS = 120_000; // 2 minutes

export const SuperAdminPage: React.FC = () => {
  const {
    isAuthenticated, adminEmail, boutiques, loading, error,
    initAuthListener, logout, loadBoutiques, clearError,
  } = useSuperAdminStore();

  const { t } = useTranslation();
  const [tab,         setTab]         = useState<Tab>('overview');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [, forceUpdate]               = useState(0);
  const hasInitialized                = useRef(false);

  useEffect(() => {
    const unsub = initAuthListener();
    return unsub;
  }, [initAuthListener]);

  const refresh = useCallback(async () => {
    clearError();
    await loadBoutiques();
    setLastRefresh(new Date());
  }, [clearError, loadBoutiques]);

  // Auto-refresh every 2 minutes while authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(refresh, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, refresh]);

  // Re-render every 30 s so the "actualisé il y a X min" display stays current
  useEffect(() => {
    const timer = setInterval(() => forceUpdate(n => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Set lastRefresh once when boutiques first populate
  useEffect(() => {
    if (boutiques.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      setLastRefresh(new Date());
    }
  }, [boutiques.length]);

  function timeSince(d: Date | null): string {
    if (!d) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (mins < 1) return t('superadmin.timeNow');
    return t('superadmin.timeMinAgo').replace('{n}', String(mins));
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm nova-card p-8">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h2 className="text-base font-semibold text-foreground mb-2">{t('superadmin.firebaseTitle')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('superadmin.firebaseDesc')}{' '}
            <code className="bg-muted px-1 rounded">.env</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <SALogin />;

  const tabBtn = (t: Tab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
        tab === t
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  const PAGE_TITLES: Record<Tab, string> = {
    overview:  t('superadmin.tabOverview'),
    boutiques: t('superadmin.tabBoutiques'),
    map:       t('superadmin.mapTitle'),
    analytics: t('superadmin.tabAnalytics'),
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 flex-wrap sticky top-0 z-30">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 80 80" fill="none">
              <path
                d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42"
                stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
              />
              <line x1="20" y1="13" x2="20" y2="60" stroke="white" strokeWidth="7" strokeLinecap="round"/>
              <line x1="20" y1="60" x2="34" y2="60" stroke="white" strokeWidth="7" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">Legwan Platform</p>
            <p className="text-[10px] text-muted-foreground">Super-Admin Console</p>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-1 ml-2">
          {tabBtn('overview',  <LayoutDashboard className="w-4 h-4" />, t('superadmin.tabOverview'))}
          {tabBtn('boutiques', <List            className="w-4 h-4" />, t('superadmin.tabBoutiques'))}
          {tabBtn('map',       <Map             className="w-4 h-4" />, t('superadmin.tabMap'))}
          {tabBtn('analytics', <BarChart2       className="w-4 h-4" />, t('superadmin.tabAnalytics'))}
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {lastRefresh && (
            <span className="text-[10px] text-muted-foreground hidden lg:block">
              {t('superadmin.refreshedAt').replace('{time}', timeSince(lastRefresh))}
            </span>
          )}
          <span className="text-xs text-muted-foreground hidden md:block">{adminEmail}</span>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs hover:bg-muted/80 transition-colors disabled:opacity-50"
            title={t('superadmin.refreshTitle')}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">{t('superadmin.refresh')}</span>
          </button>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('superadmin.logout')}</span>
          </button>
        </div>
      </header>

      {/* Thin refresh progress bar */}
      {loading && boutiques.length > 0 && (
        <div className="h-0.5 bg-primary/20 overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-pulse" />
        </div>
      )}

      {/* Main content */}
      <main className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-5">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <button
              onClick={clearError}
              className="text-destructive/70 hover:text-destructive text-sm ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Initial loading */}
        {loading && boutiques.length === 0 && (
          <div className="flex items-center justify-center py-24 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t('superadmin.loading')}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && boutiques.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Store className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium">{t('superadmin.noBoutique')}</p>
            <p className="text-xs text-center max-w-xs">
              {t('superadmin.noBoutiqueDesc')}
            </p>
          </div>
        )}

        {boutiques.length > 0 && (
          <>
            {/* Page heading */}
            <div>
              <h2 className="text-lg font-bold text-foreground nova-heading mb-0.5">
                {PAGE_TITLES[tab]}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('superadmin.installationsDesc').replace('{n}', String(boutiques.length))}
              </p>
            </div>

            {tab === 'overview'  && <SAOverview  boutiques={boutiques} />}
            {tab === 'boutiques' && <SABoutiqueTable boutiques={boutiques} />}
            {tab === 'map'       && <SAMap       boutiques={boutiques} />}
            {tab === 'analytics' && <SAAnalytics boutiques={boutiques} />}
          </>
        )}
      </main>
    </div>
  );
};

export default SuperAdminPage;
