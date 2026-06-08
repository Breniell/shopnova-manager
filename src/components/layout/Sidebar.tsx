import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';
import type { SupportedLocale } from '@/i18n/types';
import { ALL_LOCALES, LOCALE_LABELS } from '@/i18n/types';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse,
  Receipt, BarChart3, Settings, LogOut, Calculator, Truck, Users, CreditCard, TrendingDown, ClipboardList, X, Languages,
} from 'lucide-react';

// Translation key mapped to icon + path + roles
const NAV_ITEMS = [
  { path: '/',            key: 'nav.dashboard',   icon: LayoutDashboard, roles: ['gérant', 'caissier'] as const },
  { path: '/caisse',      key: 'nav.pos',          icon: ShoppingCart,    roles: ['gérant', 'caissier'] as const },
  { path: '/clients',     key: 'nav.clients',      icon: Users,           roles: ['gérant', 'caissier'] as const },
  { path: '/credit',      key: 'nav.credit',       icon: CreditCard,      roles: ['gérant', 'caissier'] as const },
  { path: '/produits',    key: 'nav.produits',     icon: Package,         roles: ['gérant'] as const },
  { path: '/stock',       key: 'nav.stock',        icon: Warehouse,       roles: ['gérant'] as const },
  { path: '/inventaire',  key: 'nav.inventaire',   icon: ClipboardList,   roles: ['gérant'] as const },
  { path: '/fournisseurs',key: 'nav.fournisseurs', icon: Truck,           roles: ['gérant'] as const },
  { path: '/ventes',      key: 'nav.ventes',       icon: Receipt,         roles: ['gérant'] as const },
  { path: '/depenses',    key: 'nav.depenses',     icon: TrendingDown,    roles: ['gérant'] as const },
  { path: '/cloture',     key: 'nav.cloture',      icon: Calculator,      roles: ['gérant', 'caissier'] as const },
  { path: '/rapports',    key: 'nav.rapports',     icon: BarChart3,       roles: ['gérant'] as const },
  { path: '/parametres',  key: 'nav.parametres',   icon: Settings,        roles: ['gérant'] as const },
];

export const Sidebar: React.FC = () => {
  const { currentUser, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { updateShop, shop } = useSettingsStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (isMobile) toggleSidebar();
  };

  const switchLanguage = (l: SupportedLocale) => {
    updateShop({ langue: l });
    try { localStorage.setItem('legwan-locale', l); } catch { /* ignore */ }
  };

  const filteredItems = NAV_ITEMS.filter(item =>
    currentUser && (item.roles as readonly string[]).includes(currentUser.role)
  );

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20" onClick={toggleSidebar} />
      )}

      <aside className={cn(
        'fixed left-0 top-0 h-full w-60 z-30 flex flex-col border-r border-border transition-transform duration-300',
        isMobile && !sidebarOpen && '-translate-x-full'
      )} style={{ background: 'linear-gradient(180deg, #1a1f35 0%, #141823 100%)' }}>

        {/* Logo */}
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-grid">
            <div className="w-9 h-9 flex items-center justify-center">
              <svg viewBox="0 0 80 80" className="w-9 h-9" fill="none">
                <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="#A93200" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="20" y1="13" x2="20" y2="60" stroke="#A93200" strokeWidth="5" strokeLinecap="round"/>
                <line x1="20" y1="60" x2="34" y2="60" stroke="#A93200" strokeWidth="5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold text-base tracking-tight">Legwan</h1>
              <p className="text-[10px] text-slate-400 tracking-wider uppercase">
                {t('nav.tagline')}
              </p>
            </div>
          </div>
          {isMobile && (
            <button onClick={toggleSidebar} className="p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Fermer le menu">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 mt-4 space-y-1 overflow-y-auto">
          {filteredItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={cn(
                  'flex items-center gap-grid px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative',
                  isActive
                    ? 'text-white bg-primary/25'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-primary" />
                )}
                <item.icon className="w-[18px] h-[18px]" />
                <span>{t(item.key)}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Language selector */}
        <div className="px-4 pb-2 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Languages className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={shop.langue}
              onChange={e => switchLanguage(e.target.value as SupportedLocale)}
              className="flex-1 bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {ALL_LOCALES.map(l => (
                <option key={l} value={l} className="bg-slate-900 text-white">
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* User section */}
        {currentUser && (
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-grid">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0"
                style={{ backgroundColor: currentUser.color }}
              >
                {currentUser.prenom[0]}{currentUser.nom[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {currentUser.prenom} {currentUser.nom}
                </p>
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
                  currentUser.role === 'gérant'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-secondary/20 text-secondary'
                )}>
                  {currentUser.role === 'gérant' ? t('common.gerant') : t('common.caissier')}
                </span>
              </div>
              <button
                onClick={handleLogout}
                aria-label={t('nav.logout')}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-red-400"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};