import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse,
  Receipt, BarChart3, Settings, LogOut, Calculator, Truck, X
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Tableau de bord', icon: LayoutDashboard, roles: ['gérant', 'caissier'] as const },
  { path: '/caisse', label: 'Point de vente', icon: ShoppingCart, roles: ['gérant', 'caissier'] as const },
  { path: '/produits', label: 'Produits', icon: Package, roles: ['gérant'] as const },
  { path: '/stock', label: 'Stock', icon: Warehouse, roles: ['gérant'] as const },
  { path: '/fournisseurs', label: 'Fournisseurs', icon: Truck, roles: ['gérant'] as const },
  { path: '/ventes', label: 'Ventes', icon: Receipt, roles: ['gérant'] as const },
  { path: '/cloture', label: 'Clôture caisse', icon: Calculator, roles: ['gérant', 'caissier'] as const },
  { path: '/rapports', label: 'Rapports', icon: BarChart3, roles: ['gérant'] as const },
  { path: '/parametres', label: 'Paramètres', icon: Settings, roles: ['gérant'] as const },
];

export const Sidebar: React.FC = () => {
  const { currentUser, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (isMobile) toggleSidebar();
  };

  const filteredItems = navItems.filter(item => {
    return currentUser && (item.roles as readonly string[]).includes(currentUser.role);
  });

  const isOpen = isMobile ? sidebarOpen : true;

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
              <svg viewBox="0 0 40 40" className="w-9 h-9">
                <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#A93200" strokeWidth="2" />
                <path d="M20,12 L20,28 M16,20 L20,12 L24,20" stroke="#A93200" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold text-base tracking-tight">Legwan</h1>
              <p className="text-[10px] text-slate-400 tracking-wider uppercase">La gestion, réinventée</p>
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
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User section */}
        {currentUser && (
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-grid">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold text-white"
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
                  {currentUser.role === 'gérant' ? 'Gérant' : 'Caissier'}
                </span>
              </div>
              <button onClick={handleLogout} aria-label="Se déconnecter" className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-red-400">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
