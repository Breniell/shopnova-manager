import React from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { formatDateLong } from '@/utils/formatters';
import { Bell } from 'lucide-react';

export const TopBar: React.FC = () => {
  const { currentUser } = useAuthStore();

  return (
    <div className="flex items-center justify-between px-4 lg:px-8 py-4 lg:py-5">
      <div>
        <h2 className="text-lg lg:text-title-lg font-semibold text-foreground nova-heading">
          Bonjour, {currentUser?.prenom} 👋
        </h2>
        <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 capitalize">
          {formatDateLong(new Date())}
        </p>
      </div>
      <button className="relative p-2 lg:p-2.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors" aria-label="Notifications">
        <Bell className="w-4 h-4 lg:w-5 lg:h-5 text-muted-foreground" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-lg bg-primary" />
      </button>
    </div>
  );
};
