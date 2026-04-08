import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  icon: React.ReactNode;
  iconBg?: string;
  value: string;
  label: string;
  trend?: { value: string; positive: boolean };
  className?: string;
}

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(({ icon, iconBg = 'bg-primary/20', value, label, trend, className }, ref) => {
  return (
    <div ref={ref} className={cn('nova-card-accent p-3 sm:p-5', className)}>
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', iconBg)}>
          {icon}
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
            trend.positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          )}>
            {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-xl sm:text-[28px] font-semibold text-foreground tabular-nums leading-tight">{value}</div>
        <div className="text-sm text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
});
StatCard.displayName = 'StatCard';
