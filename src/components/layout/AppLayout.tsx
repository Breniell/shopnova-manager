import React, { forwardRef, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { UpdateBanner } from '@/components/UpdateBanner';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { Menu } from 'lucide-react';

export const AppLayout = forwardRef<HTMLDivElement>((_props, ref) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        const searchInput = document.getElementById('pos-search');
        searchInput?.focus();
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        navigate('/caisse');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  if (!isAuthenticated) return null;

  return (
    <div ref={ref} className="min-h-screen bg-background">
      <Sidebar />
      <UpdateBanner />
      {/* Mobile header — pt-safe accounts for iOS notch */}
      {isMobile && (
        <div className="fixed top-0 left-0 right-0 z-10 bg-card border-b border-border px-4 flex items-center gap-3"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))', paddingBottom: '0.75rem' }}>
          <button onClick={toggleSidebar} aria-label="Ouvrir le menu" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-foreground font-semibold text-sm">Legwan</h1>
        </div>
      )}
      <main className={isMobile ? 'min-h-screen' : 'ml-60 min-h-screen'}
        style={isMobile ? { paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' } : undefined}>
        <Outlet />
      </main>
    </div>
  );
});

AppLayout.displayName = 'AppLayout';
