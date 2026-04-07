import React from 'react';
import { cn } from '@/lib/utils';
import { PaymentMode } from '@/stores/useSaleStore';

const paymentConfig: Record<PaymentMode, { label: string; className: string }> = {
  especes: { label: '💵 Espèces', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  mobile_money: { label: '📱 Mobile Money', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

interface PaymentBadgeProps {
  mode: PaymentMode;
  className?: string;
}

export const PaymentBadge: React.FC<PaymentBadgeProps> = ({ mode, className }) => {
  const config = paymentConfig[mode];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border', config.className, className)}>
      {config.label}
    </span>
  );
};
