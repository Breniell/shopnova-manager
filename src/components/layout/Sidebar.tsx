import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse,
  Receipt, BarChart3, Settings, LogOut, Zap
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { path: '/caisse', label: 'Point de vente', icon: ShoppingCart, roles: ['gérant', 'caissier'] as const },
  { path: '/produits', label: 'Produits', icon: Package, roles: ['gérant'] as const },
  { path: '/stock', label: 'Stock', icon: Warehouse, roles: ['gérant'] as const },
  { path: '/ventes', label: 'Ventes', icon: Receipt, roles: ['gérant'] as const },
  { path: '/rapports', label: 'Rapports', icon: BarChart3, roles: ['gérant'] as const },
  { path: '/parametres', label: 'Paramètres', icon: Settings, roles: ['gérant'] as const },
];

export const Sidebar: React.FC = () => {
  const { currentUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredItems = navItems.filter(item => {
    if (!item.roles) return true;
    return currentUser && item.roles.includes(currentUser.role);
  });

  return (
    <aside className="fixed left-0 top-0 h-full w-60 z-30 flex flex-col border-r border-border"
      style={{ background: 'linear-gradient(180deg, #151829 0%, #0F1120 100%)' }}>
      {/* Logo */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center">
          <svg viewBox="0 0 40 40" className="w-9 h-9">
            <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#6C63FF" strokeWidth="2" />
            <path d="M20,12 L20,28 M16,20 L20,12 L24,20" stroke="#6C63FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>
        <div>
          <h1 className="text-foreground font-semibold text-base tracking-tight">ShopNova</h1>
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase">La gestion, réinventée</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-4 space-y-1">
        {filteredItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative',
                isActive
                  ? 'text-foreground bg-primary/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
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
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
              style={{ backgroundColor: currentUser.color }}
            >
              {currentUser.prenom[0]}{currentUser.nom[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
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
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
