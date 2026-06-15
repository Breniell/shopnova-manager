import React, { useState } from 'react';
import type { RegistryEntry } from '@/services/registryService';
import { getBoutiqueStatus, STATUS_COLORS, STATUS_LABELS } from '@/stores/useSuperAdminStore';
import {
  X, Phone, MapPin, Calendar, Clock, Shield, Package, Users,
  Activity, Wifi, Monitor, Copy, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';
import { getCurrentBcp47 } from '@/utils/formatters';

interface Props {
  boutique: RegistryEntry | null;
  onClose: () => void;
}

function toDate(v: unknown): Date {
  if (v && typeof (v as Record<string, unknown>).toDate === 'function')
    return (v as { toDate(): Date }).toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function fmtDate(d: Date): string {
  if (d.getTime() === 0) return '—';
  return d.toLocaleString(getCurrentBcp47(), { dateStyle: 'long', timeStyle: 'short' });
}

const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows',
  macos:   'macOS',
  linux:   'Linux',
  web:     'Web',
};

export const SABoutiqueDetail: React.FC<Props> = ({ boutique, onClose }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

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

  const copyId = () => {
    if (!boutique) return;
    navigator.clipboard.writeText(boutique.boutiqueId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!boutique) return null;

  const lastSeen     = toDate(boutique.lastSeen);
  const registeredAt = toDate(boutique.registeredAt);
  const status       = getBoutiqueStatus(lastSeen);
  const color        = STATUS_COLORS[status];
  const health       = boutique.health;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-background border-l border-border z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
              style={{ backgroundColor: color + '25' }}
            >
              <svg width="20" height="20" viewBox="0 0 80 80" fill="none">
                <path
                  d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42"
                  stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
                />
                <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm leading-tight">{boutique.nom || '—'}</p>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5"
                style={{ color, backgroundColor: color + '20' }}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label={t('superadmin.closeAria')}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Contact */}
          {(boutique.telephone || boutique.adresse) && (
            <div className="space-y-2">
              {boutique.telephone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{boutique.telephone}</span>
                </div>
              )}
              {boutique.adresse && (
                <div className="flex items-start gap-2.5 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-foreground">{boutique.adresse}</span>
                </div>
              )}
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('superadmin.detailInstalled')}</span>
              </div>
              <p className="text-xs text-foreground leading-snug">{fmtDate(registeredAt)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/40">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('superadmin.detailLastSeen')}</span>
              </div>
              <p className="text-xs font-medium text-foreground">{timeAgo(lastSeen)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{fmtDate(lastSeen)}</p>
            </div>
          </div>

          {/* Health & activity */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('superadmin.detailSectionHealth')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  icon: Users,
                  label: t('superadmin.detailHealthUsers'),
                  value: health?.usersCount != null ? String(health.usersCount) : '—',
                  color: 'text-[#8B5CF6]',
                },
                {
                  icon: Activity,
                  label: t('superadmin.detailHealthActive'),
                  value: health == null ? '—' : health.isActive ? t('superadmin.detailHealthActiveYes') : t('superadmin.detailHealthActiveNo'),
                  color: health?.isActive ? 'text-secondary' : 'text-muted-foreground',
                },
                {
                  icon: Clock,
                  label: t('superadmin.detailHealthLastActivity'),
                  value: health?.lastActivityAt
                    ? fmtDate(new Date(health.lastActivityAt))
                    : t('superadmin.detailHealthNever'),
                  color: 'text-[#F59E0B]',
                },
                {
                  icon: Package,
                  label: t('superadmin.detailVersionLabel'),
                  value: health?.appVersion ? `v${health.appVersion}` : boutique.version ? `v${boutique.version}` : '—',
                  color: 'text-primary',
                },
              ].map((s, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <s.icon className={cn('w-3.5 h-3.5', s.color)} />
                    <span className="text-[10px] text-muted-foreground">{s.label}</span>
                  </div>
                  <p className="text-sm font-bold text-foreground leading-snug">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('superadmin.detailSectionLoc')}
            </p>
            {boutique.location ? (
              <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                <div className="flex items-center gap-2">
                  {boutique.location.source === 'manual' ? (
                    <MapPin className="w-3.5 h-3.5 text-green-600" />
                  ) : boutique.location.precision === 'gps' ? (
                    <MapPin className="w-3.5 h-3.5 text-[#2B6954]" />
                  ) : (
                    <Wifi className="w-3.5 h-3.5 text-[#F59E0B]" />
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {boutique.location.source === 'manual'
                      ? t('superadmin.detailManualLabel')
                      : boutique.location.precision === 'gps'
                        ? t('superadmin.detailGpsLabel')
                        : t('superadmin.detailIpLabel')}
                  </span>
                  <span className="text-[10px] bg-muted rounded px-1 text-muted-foreground ml-auto">
                    {boutique.location.source.toUpperCase()}
                  </span>
                </div>
                {boutique.location.quartier && (
                  <p className="text-xs text-foreground font-medium">
                    {t('superadmin.detailQuartierLabel').replace('{q}', boutique.location.quartier)}
                  </p>
                )}
                {boutique.location.pointDeRepere && (
                  <p className="text-xs text-muted-foreground">
                    {t('superadmin.detailPointLabel').replace('{p}', boutique.location.pointDeRepere)}
                  </p>
                )}
                {boutique.location.city && (
                  <p className="text-xs text-muted-foreground">{t('superadmin.detailCityLabel').replace('{city}', boutique.location.city)}</p>
                )}
                {boutique.location.country && (
                  <p className="text-xs text-muted-foreground">{t('superadmin.detailCountryLabel').replace('{country}', boutique.location.country)}</p>
                )}
                <p className="text-[10px] font-mono text-muted-foreground">
                  {boutique.location.lat.toFixed(5)}, {boutique.location.lng.toFixed(5)}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${boutique.location.lat},${boutique.location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t('superadmin.mapItinerary')}
                </a>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/20 flex items-start gap-2.5">
                <Wifi className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('superadmin.detailNoLocDesc')}
                </p>
              </div>
            )}
          </div>

          {/* System info */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('superadmin.detailSectionSys')}
            </p>
            <div className="space-y-2">
              {[
                {
                  icon: Monitor,
                  label: t('superadmin.detailPlatformLabel'),
                  value: PLATFORM_LABELS[boutique.platform?.toLowerCase() ?? ''] ?? boutique.platform ?? t('superadmin.unknown'),
                },
                {
                  icon: Package,
                  label: 'Version app',
                  value: boutique.version ? `v${boutique.version}` : '—',
                  mono: true,
                },
                {
                  icon: Shield,
                  label: t('superadmin.detailRecoveryLabel'),
                  value: boutique.isRecoveryEnabled ? t('superadmin.detailRecoveryOn') : t('superadmin.detailRecoveryOff'),
                  valueColor: boutique.isRecoveryEnabled ? 'text-[#2B6954]' : undefined,
                },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <row.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                  </div>
                  <span className={cn('text-xs font-medium text-foreground', row.mono && 'font-mono', row.valueColor)}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Boutique ID */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t('superadmin.detailSectionId')}
            </p>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30">
              <span className="text-[10px] font-mono text-muted-foreground flex-1 break-all">
                {boutique.boutiqueId}
              </span>
              <button
                onClick={copyId}
                className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                title={t('superadmin.detailCopyTitle')}
              >
                {copied
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-[#2B6954]" />
                  : <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
