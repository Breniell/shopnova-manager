import React from 'react';
import { cn } from '@/lib/utils';

interface NovaCardProps {
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
  title?: string;
  subtitle?: string;
}

export const NovaCard: React.FC<NovaCardProps> = ({ children, className, accent = false, title, subtitle }) => {
  return (
    <div className={cn(accent ? 'nova-card-accent' : 'nova-card', 'p-5', className)}>
      {title && (
        <div className="mb-4">
          <h3 className="nova-heading text-foreground text-base">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
};
