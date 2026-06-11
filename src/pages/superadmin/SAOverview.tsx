import React, { useMemo } from 'react';
import type { RegistryEntry } from '@/services/registryService';
import { getBoutiqueStatus, STATUS_COLORS } from '@/stores/useSuperAdminStore';
import { useTranslation } from '@/i18n';
import {
  Store, TrendingUp, Users, Package, Activity, Globe, ShoppingBag, BarChart2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface Props {
  boutiques: RegistryEntry[];
}

function toDate(v: unknown): Date {
  if (v && typeof (v as Record<string, unknown>).toDate === 'function')
    return (v as { toDate(): Date }).toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function fmtFCFA(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M FCFA';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k FCFA';
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

export const SAOverview: React.FC<Props> = ({ boutiques }) => {
  const { t } = useTranslation();

  function timeAgo(d: Date): string {
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return t('superadmin.timeNow');
    if (mins < 60) return t('superadmin.timeMinAgo').replace('{n}', String(mins));
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('superadmin.timeHAgo').replace('{n}', String(hrs));
    const days = Math.floor(hrs / 24);
    if (days < 30) return t('superadmin.timeDayAgo').replace('{n}', String(days));
    return t('superadmin.timeMonthAgo').replace('{n}', String(Math.floor(days / 30)));
  }
  const total     = boutiques.length;
  const active    = boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'active').length;
  const recent    = boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'recent').length;
  const inactive  = boutiques.filter(b => getBoutiqueStatus(toDate(b.lastSeen)) === 'inactive').length;

  const totalRevenue   = boutiques.reduce((s, b) => s + (b.stats?.totalRevenue ?? 0), 0);
  const totalVentes    = boutiques.reduce((s, b) => s + (b.stats?.totalVentes ?? 0), 0);
  const totalUsers     = boutiques.reduce((s, b) => s + (b.stats?.totalUsers ?? 0), 0);
  const totalProducts  = boutiques.reduce((s, b) => s + (b.stats?.totalProducts ?? 0), 0);
  const totalCustomers = boutiques.reduce((s, b) => s + (b.stats?.totalCustomers ?? 0), 0);
  const withLocation   = boutiques.filter(b => b.location).length;

  const topBoutiques = useMemo(() =>
    [...boutiques]
      .sort((a, b) => (b.stats?.totalRevenue ?? 0) - (a.stats?.totalRevenue ?? 0))
      .slice(0, 8)
      .map(b => ({
        name: (b.nom ?? '—').substring(0, 14),
        ca: Math.round(b.stats?.totalRevenue ?? 0),
        color: STATUS_COLORS[getBoutiqueStatus(toDate(b.lastSeen))],
      })),
    [boutiques],
  );

  const statusData = useMemo(() =>
    [
      { name: t('superadmin.statusActive'),   value: active,   color: STATUS_COLORS.active },
      { name: t('superadmin.statusRecent'),   value: recent,   color: STATUS_COLORS.recent },
      { name: t('superadmin.statusInactive'), value: inactive, color: STATUS_COLORS.inactive },
    ].filter(d => d.value > 0),
    [active, recent, inactive, t],
  );

  const recentBoutiques = useMemo(() =>
    [...boutiques]
      .sort((a, b) => toDate(b.lastSeen).getTime() - toDate(a.lastSeen).getTime())
      .slice(0, 8),
    [boutiques],
  );

  const kpis = [
    {
      icon: Store, label: t('superadmin.kpiInstallations'),
      value: String(total),
      sub: t('superadmin.kpiInstallSub').replace('{active}', String(active)).replace('{recent}', String(recent)).replace('{inactive}', String(inactive)),
      color: 'text-primary', bg: 'bg-primary/10',
    },
    {
      icon: Activity, label: t('superadmin.kpiActive24h'),
      value: String(active),
      sub: t('superadmin.statsActiveSub').replace('{pct}', String(Math.round((active / (total || 1)) * 100))),
      color: 'text-[#2B6954]', bg: 'bg-[#2B6954]/10',
    },
    {
      icon: TrendingUp, label: t('superadmin.kpiRevenue'),
      value: fmtFCFA(totalRevenue),
      sub: t('superadmin.kpiRevenueSub').replace('{n}', totalVentes.toLocaleString()),
      color: 'text-secondary', bg: 'bg-secondary/10',
    },
    {
      icon: ShoppingBag, label: t('superadmin.kpiTotalSales'),
      value: totalVentes.toLocaleString(),
      sub: t('superadmin.kpiSalesCompleted'),
      color: 'text-[#F59E0B]', bg: 'bg-[#F59E0B]/10',
    },
    {
      icon: Users, label: t('superadmin.kpiUsers'),
      value: String(totalUsers),
      sub: String(totalCustomers.toLocaleString()),
      color: 'text-[#8B5CF6]', bg: 'bg-[#8B5CF6]/10',
    },
    {
      icon: Package, label: t('superadmin.kpiProducts'),
      value: totalProducts.toLocaleString(),
      sub: t('superadmin.kpiAllCatalogs'),
      color: 'text-[#EC4899]', bg: 'bg-[#EC4899]/10',
    },
    {
      icon: Globe, label: t('superadmin.kpiGeolocated'),
      value: `${withLocation}/${total}`,
      sub: t('superadmin.statsNoGeoSub').replace('{n}', String(total - withLocation)),
      color: 'text-[#06B6D4]', bg: 'bg-[#06B6D4]/10',
    },
    {
      icon: BarChart2, label: t('superadmin.kpiActivityRate'),
      value: total > 0 ? `${Math.round((active / total) * 100)}%` : '—',
      sub: t('superadmin.kpiActiveIn24h'),
      color: 'text-muted-foreground', bg: 'bg-muted/50',
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPI grid — 8 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="nova-card p-4 flex flex-col gap-2">
            <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center`}>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
            <p className="text-sm font-bold text-foreground leading-tight break-all">{k.value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Top boutiques by CA */}
        <div className="lg:col-span-2 nova-card p-4">
          <p className="text-sm font-semibold text-foreground mb-0.5">{t('superadmin.chartTopTitle')}</p>
          <p className="text-xs text-muted-foreground mb-4">{t('superadmin.chartTopSub')}</p>
          {topBoutiques.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">{t('superadmin.noData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topBoutiques} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tickFormatter={v =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` :
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false} width={44}
                />
                <Tooltip
                  formatter={(v: number) => [new Intl.NumberFormat('fr-FR').format(v) + ' FCFA', 'CA']}
                  contentStyle={{
                    borderRadius: '8px', border: '1px solid hsl(var(--border))',
                    fontSize: '12px', background: 'hsl(var(--card))',
                  }}
                />
                <Bar dataKey="ca" radius={[4, 4, 0, 0]}>
                  {topBoutiques.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status donut */}
        <div className="nova-card p-4">
          <p className="text-sm font-semibold text-foreground mb-0.5">{t('superadmin.chartStatusTitle')}</p>
          <p className="text-xs text-muted-foreground mb-3">
            {total} installation{total !== 1 ? 's' : ''}
          </p>
          {statusData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">{t('superadmin.noData')}</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%" cy="50%"
                    innerRadius={38} outerRadius={62}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [v, name]}
                    contentStyle={{
                      borderRadius: '8px', border: '1px solid hsl(var(--border))',
                      fontSize: '12px', background: 'hsl(var(--card))',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {statusData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-semibold text-foreground tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="nova-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3">{t('superadmin.recentActivity')}</p>
        {recentBoutiques.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('superadmin.noBoutiqueList')}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {recentBoutiques.map(b => {
              const lastSeen = toDate(b.lastSeen);
              const status = getBoutiqueStatus(lastSeen);
              const color = STATUS_COLORS[status];
              return (
                <div
                  key={b.boutiqueId}
                  className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/30"
                >
                  <div
                    className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: color + '25' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 80 80" fill="none">
                      <path
                        d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42"
                        stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                      />
                      <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                      <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{b.nom || '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(lastSeen)}</p>
                  </div>
                  <span className="text-[9px] font-mono bg-muted px-1 py-0.5 rounded shrink-0 text-muted-foreground">
                    v{b.version}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
