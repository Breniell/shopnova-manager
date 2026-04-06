import React, { forwardRef, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/stores/useAuthStore';

export const AppLayout = forwardRef<HTMLDivElement>((_props, ref) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close modals handled by individual pages
      }
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
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-60 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
};
