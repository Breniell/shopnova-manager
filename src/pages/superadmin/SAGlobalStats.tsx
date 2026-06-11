import React from 'react';
import type { RegistryEntry } from '@/services/registryService';
import { getBoutiqueStatus } from '@/stores/useSuperAdminStore';
import { Store, TrendingUp, Users, Package, Activity, Clock, Globe } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface Props {
  boutiques: RegistryEntry[];
}

function toDate(v: unknown): Date {
  if (v && typeof (v as Record<string, unknown>).toDate === 'function') {
    return (v as { toDate(): Date }).toDate();
  }
  if (v instanceof Date) return v;
  return new Date();
}

function formatFCFA(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

export const SAGlobalStats: React.FC<Props> = ({ boutiques }) => {
  const { t } = useTranslation();
  const total = boutiques.length;
  const active   = boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'active').length;
  const recent   = boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'recent').length;
  const inactive = boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'inactive').length;

  const totalRevenue  = boutiques.reduce((s, b) => s + (b.stats?.totalRevenue ?? 0), 0);
  const totalVentes   = boutiques.reduce((s, b) => s + (b.stats?.totalVentes ?? 0), 0);
  const totalUsers    = boutiques.reduce((s, b) => s + (b.stats?.totalUsers ?? 0), 0);
  const totalProducts = boutiques.reduce((s, b) => s + (b.stats?.totalProducts ?? 0), 0);

  const versions = [...new Set(boutiques.map(b => b.version))].join(', ') || '—';
  const withLocation = boutiques.filter(b => b.location).length;

  const cards = [
    {
      icon: Store,
      label: t('superadmin.statsTotalInstalls'),
      value: total.toString(),
      sub: t('superadmin.statsInstallsSub').replace('{active}', String(active)).replace('{recent}', String(recent)).replace('{inactive}', String(inactive)),
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      icon: TrendingUp,
      label: t('superadmin.statsRevenue'),
      value: formatFCFA(totalRevenue),
      sub: t('superadmin.statsRevenueSub').replace('{n}', totalVentes.toLocaleString()),
      color: 'text-secondary',
      bg: 'bg-secondary/10',
    },
    {
      icon: Activity,
      label: t('superadmin.statsActive24h'),
      value: active.toString(),
      sub: t('superadmin.statsActiveSub').replace('{pct}', String(Math.round((active / (total || 1)) * 100))),
      color: 'text-[#2B6954]',
      bg: 'bg-[#2B6954]/10',
    },
    {
      icon: Users,
      label: t('superadmin.statsUsersCreated'),
      value: totalUsers.toString(),
      sub: t('superadmin.statsUsersSub'),
      color: 'text-[#F59E0B]',
      bg: 'bg-[#F59E0B]/10',
    },
    {
      icon: Package,
      label: t('superadmin.statsProducts'),
      value: totalProducts.toLocaleString(),
      sub: t('superadmin.statsProductsSub'),
      color: 'text-[#8B5CF6]',
      bg: 'bg-[#8B5CF6]/10',
    },
    {
      icon: Globe,
      label: t('superadmin.statsGeolocated'),
      value: withLocation.toString(),
      sub: t('superadmin.statsNoGeoSub').replace('{n}', String(total - withLocation)),
      color: 'text-[#EC4899]',
      bg: 'bg-[#EC4899]/10',
    },
    {
      icon: Clock,
      label: t('superadmin.statsVersions'),
      value: versions,
      sub: t('superadmin.statsVersionSub').replace('{n}', String(boutiques.length)),
      color: 'text-muted-foreground',
      bg: 'bg-muted/50',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map((card, i) => (
        <div key={i} className="nova-card p-4 flex flex-col gap-2">
          <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
            <card.icon className={`w-4 h-4 ${card.color}`} />
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">{card.label}</p>
          <p className="text-base font-bold text-foreground leading-tight">{card.value}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">{card.sub}</p>
        </div>
      ))}
    </div>
  );
};
