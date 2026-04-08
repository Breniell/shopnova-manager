import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({ open, onClose, title, children, className }) => {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className={cn(
        'fixed right-0 top-0 h-full w-[480px] bg-card border-l border-border z-50 animate-slide-in-right overflow-y-auto',
        className
      )}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          {title && <h2 className="nova-heading text-lg text-foreground">{title}</h2>}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </>
  );
};
