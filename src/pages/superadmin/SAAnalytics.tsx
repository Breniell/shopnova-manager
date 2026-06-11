import React, { useMemo } from 'react';
import type { RegistryEntry } from '@/services/registryService';
import { Monitor, Globe, Package, Wifi } from 'lucide-react';
import { useTranslation } from '@/i18n';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface Props {
  boutiques: RegistryEntry[];
}

const PLATFORM_COLORS: Record<string, string> = {
  windows: '#0078D4',
  macos:   '#A2AAAD',
  linux:   '#E8C94A',
  web:     '#61DAFB',
  unknown: '#6B7280',
};

const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos:   'macOS',
  linux:   'Linux',
  web:     'Web',
};

export const SAAnalytics: React.FC<Props> = ({ boutiques }) => {
  const { t } = useTranslation();

  const platformData = useMemo(() => {
    const counts: Record<string, number> = {};
    boutiques.forEach(b => {
      const p = b.platform?.toLowerCase() ?? 'unknown';
      counts[p] = (counts[p] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([platform, value]) => ({
        name:  platform === 'unknown' ? t('superadmin.unknown') : (PLATFORM_LABELS[platform] ?? platform),
        value,
        color: PLATFORM_COLORS[platform] ?? '#6B7280',
      }))
      .sort((a, b) => b.value - a.value);
  }, [boutiques, t]);

  const versionData = useMemo(() => {
    const counts: Record<string, number> = {};
    boutiques.forEach(b => {
      const v = b.version ?? 'unknown';
      counts[v] = (counts[v] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => b.count - a.count);
  }, [boutiques]);

  const countryData = useMemo(() => {
    const counts: Record<string, number> = {};
    boutiques.forEach(b => {
      if (b.location?.country) {
        counts[b.location.country] = (counts[b.location.country] ?? 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [boutiques]);

  const withGeo = boutiques.filter(b => b.location).length;
  const withGps = boutiques.filter(b => b.location?.precision === 'gps').length;
  const withIp  = boutiques.filter(b => b.location?.precision === 'city').length;
  const total   = boutiques.length;

  return (
    <div className="space-y-5">
      {/* Top row: platform + version + geo */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Platform donut */}
        <div className="nova-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{t('superadmin.analyticsPlatforms')}</p>
          </div>
          {platformData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">{t('superadmin.noData')}</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie
                    data={platformData}
                    cx="50%" cy="50%"
                    innerRadius={32} outerRadius={55}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {platformData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
              <div className="space-y-1.5 mt-2">
                {platformData.map((d, i) => (
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

        {/* Version bars */}
        <div className="nova-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-secondary" />
            <p className="text-sm font-semibold text-foreground">{t('superadmin.analyticsVersions')}</p>
          </div>
          {versionData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">{t('superadmin.noData')}</div>
          ) : (
            <div className="space-y-3 mt-2">
              {versionData.map((d, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-foreground">v{d.version}</span>
                    <span className="text-muted-foreground">{d.count} inst.</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(d.count / (total || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Geo stats */}
        <div className="nova-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-4 h-4 text-[#06B6D4]" />
            <p className="text-sm font-semibold text-foreground">{t('superadmin.analyticsGeo')}</p>
          </div>
          <div className="space-y-3 mt-2">
            {[
              { label: t('superadmin.analyticsGpsLabel'), count: withGps,         color: '#2B6954' },
              { label: t('superadmin.analyticsIpLabel'),  count: withIp,          color: '#F59E0B' },
              { label: t('superadmin.analyticsNoGeo'),    count: total - withGeo, color: '#EF4444' },
            ].map((row, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    <span className="text-muted-foreground">{row.label}</span>
                  </div>
                  <span className="font-semibold text-foreground tabular-nums">{row.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(row.count / (total || 1)) * 100}%`,
                      backgroundColor: row.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div className="mt-4 pt-3 border-t border-border/60">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                {t('superadmin.analyticsConsent')}
              </p>
              <p className="text-2xl font-bold text-foreground">
                {Math.round((withGeo / total) * 100)}%
              </p>
              <p className="text-xs text-muted-foreground">{withGeo}/{total} boutiques</p>
            </div>
          )}
        </div>
      </div>

      {/* Country distribution */}
      {countryData.length > 0 && (
        <div className="nova-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-[#EC4899]" />
            <p className="text-sm font-semibold text-foreground">{t('superadmin.analyticsGeoDistrib')}</p>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(120, countryData.length * 36)}>
            <BarChart
              data={countryData}
              layout="vertical"
              margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                dataKey="country" type="category" width={90}
                tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px', border: '1px solid hsl(var(--border))',
                  fontSize: '12px', background: 'hsl(var(--card))',
                }}
              />
              <Bar dataKey="count" fill="#A93200" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {countryData.length === 0 && withGeo === 0 && (
        <div className="nova-card p-8 text-center">
          <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('superadmin.analyticsNoGeoTitle')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t('superadmin.analyticsNoGeoDesc')}
          </p>
        </div>
      )}
    </div>
  );
};
