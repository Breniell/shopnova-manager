import React from 'react';
import { cn } from '@/lib/utils';

type StockStatusType = 'ok' | 'low' | 'out';

const statusConfig: Record<StockStatusType, { label: string; className: string }> = {
  ok: { label: 'En stock', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  low: { label: 'Stock faible', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  out: { label: 'Rupture', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

interface StatusBadgeProps {
  status: StockStatusType;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const config = statusConfig[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', config.className, className)}>
      {config.label}
    </span>
  );
};
