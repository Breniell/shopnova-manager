/**
 * Console Super-Admin Legwan
 *
 * Route: /superadmin (hidden — not linked from sidebar)
 * Auth: email/password via secondary Firebase app (saAuth)
 * Access: breniellkouda@gmail.com uniquement
 *         (source de vérité : firestore.rules + SUPERADMIN_EMAIL dans useSuperAdminStore.ts —
 *          les deux DOIVENT rester identiques)
 */
import React, { useEffect, useState } from 'react';
import { useSuperAdminStore } from '@/stores/useSuperAdminStore';
import { SALogin } from './SALogin';
import { SAGlobalStats } from './SAGlobalStats';
import { SABoutiqueTable } from './SABoutiqueTable';
import { SAMap } from './SAMap';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  LayoutDashboard, Map, List, RefreshCw, LogOut, Loader2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'map' | 'list';

export const SuperAdminPage: React.FC = () => {
  const {
    isAuthenticated, adminEmail, boutiques, loading, error,
    initAuthListener, logout, loadBoutiques, clearError,
  } = useSuperAdminStore();

  const [tab, setTab] = useState<Tab>('overview');

  // Listen to super-admin Firebase auth state
  useEffect(() => {
    const unsub = initAuthListener();
    return unsub;
  }, [initAuthListener]);

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm nova-card p-8">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h2 className="text-base font-semibold text-foreground mb-2">Firebase non configuré</h2>
          <p className="text-sm text-muted-foreground">
            La console super-admin nécessite une connexion Firebase.
            Ajoutez les variables d'environnement dans le fichier <code className="bg-muted px-1 rounded">.env</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SALogin />;
  }

  const tabBtn = (t: Tab, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
        tab === t
          ? 'bg-primary text-primary-foreground shadow'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 80 80" fill="none">
              <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
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
        <nav className="flex items-center gap-1 ml-4">
          {tabBtn('overview', <LayoutDashboard className="w-4 h-4" />, 'Vue globale')}
          {tabBtn('map',      <Map className="w-4 h-4" />,            'Carte')}
          {tabBtn('list',     <List className="w-4 h-4" />,           'Boutiques')}
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:block">{adminEmail}</span>

          <button
            onClick={() => { clearError(); loadBoutiques(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs hover:bg-muted/80 transition-colors disabled:opacity-50"
            title="Actualiser"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>

          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
            <button onClick={clearError} className="ml-auto text-destructive/70 hover:text-destructive text-sm">✕</button>
          </div>
        )}

        {/* Loading state */}
        {loading && boutiques.length === 0 && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Chargement des données…</span>
          </div>
        )}

        {/* Page: Vue globale */}
        {tab === 'overview' && !loading && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-foreground nova-heading mb-1">Vue globale</h2>
              <p className="text-sm text-muted-foreground">
                {boutiques.length} installation{boutiques.length !== 1 ? 's' : ''} enregistrée{boutiques.length !== 1 ? 's' : ''} sur la plateforme Legwan.
              </p>
            </div>
            <SAGlobalStats boutiques={boutiques} />

            {/* Quick preview of both */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Carte rapide</h3>
              <SAMap boutiques={boutiques} />
            </div>
          </div>
        )}

        {/* Page: Carte */}
        {tab === 'map' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground nova-heading mb-1">Carte des installations</h2>
              <p className="text-sm text-muted-foreground">
                Visualisation géographique de toutes les boutiques Legwan.
              </p>
            </div>
            <SAMap boutiques={boutiques} />
          </div>
        )}

        {/* Page: Liste */}
        {tab === 'list' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground nova-heading mb-1">Liste des boutiques</h2>
              <p className="text-sm text-muted-foreground">
                Toutes les installations, triables et filtrables.
              </p>
            </div>
            <SABoutiqueTable boutiques={boutiques} />
          </div>
        )}
      </main>
    </div>
  );
};

export default SuperAdminPage;