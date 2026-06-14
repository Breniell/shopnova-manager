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
    <div ref={ref} className={cn('nova-card-accent', className)}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[13px] text-muted-foreground font-semibold leading-tight">{label}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
          {icon}
        </div>
      </div>
      <div className="money text-2xl sm:text-[28px] text-foreground leading-tight">{value}</div>
      {trend && (
        <div className={cn(
          'flex items-center gap-1 text-xs font-semibold mt-2',
          trend.positive ? 'text-emerald-500' : 'text-red-500'
        )}>
          {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{trend.value}</span>
        </div>
      )}
    </div>
  );
});
StatCard.displayName = 'StatCard';
