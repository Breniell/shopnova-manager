/**
 * Carte interactive des installations Legwan.
 *
 * Chaque boutique apparaît dès qu'elle a une localisation (IP ou adresse).
 * Marqueurs différenciés :
 *   — Rond plein  : localisation précise (adresse Nominatim, niveau rue)
 *   — Rond cerclé : localisation approximative (IP, niveau ville)
 * Cluster, heatmap CA, légende complète.
 */
import React, { useState, useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RegistryEntry } from '@/services/registryService';
import { getBoutiqueStatus, STATUS_COLORS } from '@/stores/useSuperAdminStore';
import { cn } from '@/lib/utils';
import { MapPin, Wifi } from 'lucide-react';

interface Props { boutiques: RegistryEntry[] }

function toDate(v: unknown): Date {
  if (v && typeof (v as Record<string, unknown>).toDate === 'function') return (v as { toDate(): Date }).toDate();
  if (v instanceof Date) return v;
  return new Date(0);
}
function fmtFCFA(n: number) { return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'; }
function fmtDate(d: Date) { return d.getTime() === 0 ? '—' : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); }

// ─── Marker factories ─────────────────────────────────────────────────────────

/** Solid marker = street-level precision (Nominatim) */
function createPreciseMarker(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [44, 52],
    iconAnchor: [22, 52],
    popupAnchor: [0, -54],
    html: `<div style="
        width:44px;height:44px;border-radius:12px;
        background:${color};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 14px rgba(0,0,0,0.35);
        border:2.5px solid rgba(255,255,255,0.4);
        position:relative;">
      <svg width="26" height="26" viewBox="0 0 80 80" fill="none">
        <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="20" y1="13" x2="20" y2="60" stroke="white" stroke-width="6" stroke-linecap="round"/>
        <line x1="20" y1="60" x2="34" y2="60" stroke="white" stroke-width="6" stroke-linecap="round"/>
      </svg>
      <div style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);
        width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;
        border-top:10px solid ${color};"></div>
    </div>`,
  });
}

/** Dashed-border marker = city-level precision (IP geolocation) */
function createApproxMarker(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [44, 52],
    iconAnchor: [22, 52],
    popupAnchor: [0, -54],
    html: `<div style="
        width:44px;height:44px;border-radius:12px;
        background:${color}CC;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 10px rgba(0,0,0,0.25);
        border:2.5px dashed rgba(255,255,255,0.6);
        position:relative;">
      <svg width="22" height="22" viewBox="0 0 80 80" fill="none">
        <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
        <line x1="20" y1="13" x2="20" y2="60" stroke="white" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
        <line x1="20" y1="60" x2="34" y2="60" stroke="white" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
      </svg>
      <div style="position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);
        width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;
        border-top:9px solid ${color}CC;"></div>
    </div>`,
  });
}

function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  return L.divIcon({
    className: '',
    iconSize: [50, 50],
    html: `<div style="
        width:50px;height:50px;border-radius:50%;
        background:#A93200;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 14px rgba(169,50,0,0.45);
        border:3px solid rgba(255,255,255,0.4);
        color:white;font-weight:700;font-size:15px;">
      ${count}
    </div>`,
  });
}

// ─── Map modes ────────────────────────────────────────────────────────────────

type MapMode = 'markers' | 'heatmap' | 'both';

// ─── Component ────────────────────────────────────────────────────────────────

export const SAMap: React.FC<Props> = ({ boutiques }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<MapMode>('both');

  const geolocated = useMemo(
    () => boutiques.filter(b => b.location?.lat && b.location?.lng),
    [boutiques]
  );
  const withoutLocation = useMemo(
    () => boutiques.filter(b => !b.location?.lat),
    [boutiques]
  );
  const preciseCount = geolocated.filter(b => b.location?.precision === 'street').length;
  const approxCount  = geolocated.filter(b => b.location?.precision !== 'street').length;

  const maxRevenue = useMemo(
    () => Math.max(...geolocated.map(b => b.stats?.totalRevenue ?? 0), 1),
    [geolocated]
  );

  const center: [number, number] = [3.87, 11.52]; // Cameroun

  const modeBtn = (m: MapMode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        mode === m ? 'bg-primary text-primary-foreground shadow' : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="nova-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('superadmin.mapCardTitle')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('superadmin.mapLocated').replace('{located}', String(geolocated.length)).replace('{total}', String(boutiques.length))}
            {geolocated.length > 0 && (
              <span className="ml-2">
                · {t('superadmin.mapStreet').replace('{n}', String(preciseCount))} · {t('superadmin.mapCity').replace('{n}', String(approxCount))}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {modeBtn('markers', t('superadmin.mapModeMarkers'))}
          {modeBtn('heatmap', t('superadmin.mapModeHeatmap'))}
          {modeBtn('both',    t('superadmin.mapModeBoth'))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-b border-border/60 bg-muted/30">
        {(Object.entries(STATUS_COLORS) as [string, string][]).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-sm flex items-center justify-center" style={{ backgroundColor: color + '25' }}>
              <svg width="10" height="10" viewBox="0 0 80 80" fill="none">
                <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="8" strokeLinecap="round"/>
                <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-[10px] text-muted-foreground capitalize">{status}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border/60">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-muted-foreground">{t('superadmin.mapPrecise')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">{t('superadmin.analyticsIpLabel')}</span>
        </div>
        {mode !== 'markers' && (
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-4 h-4 rounded-full bg-primary/20 border border-primary/40" />
            <span className="text-[10px] text-muted-foreground">{t('superadmin.mapModeHeatmap')}</span>
          </div>
        )}
      </div>

      {/* Map */}
      {geolocated.length === 0 ? (
        <div className="h-96 flex flex-col items-center justify-center gap-3 bg-muted/10">
          <Wifi className="w-8 h-8 text-muted-foreground/40" />
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">{t('superadmin.mapNoGeo')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">
              {t('superadmin.mapNoGeoDesc')}
            </p>
          </div>
        </div>
      ) : (
        <MapContainer center={center} zoom={5} style={{ height: '520px', width: '100%' }} className="z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Heatmap circles (sized by CA) */}
          {(mode === 'heatmap' || mode === 'both') && geolocated.map(b => {
            const revenue = b.stats?.totalRevenue ?? 0;
            const isApprox = b.location?.precision !== 'street';
            const radius = (isApprox ? 8000 : 2000) + (revenue / maxRevenue) * 40_000;
            const opacity = 0.06 + (revenue / maxRevenue) * 0.18;
            const color = STATUS_COLORS[getBoutiqueStatus(toDate(b.lastSeen))];
            return (
              <Circle
                key={`heat-${b.boutiqueId}`}
                center={[b.location!.lat, b.location!.lng]}
                radius={radius}
                pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight: 0 }}
              />
            );
          })}

          {/* Clustered markers */}
          {(mode === 'markers' || mode === 'both') && (
            <MarkerClusterGroup iconCreateFunction={createClusterIcon} maxClusterRadius={60} showCoverageOnHover={false}>
              {geolocated.map(b => {
                const status = getBoutiqueStatus(toDate(b.lastSeen));
                const color  = STATUS_COLORS[status];
                const isApprox = b.location?.precision !== 'street';
                const icon = isApprox ? createApproxMarker(color) : createPreciseMarker(color);
                const lastSeen = toDate(b.lastSeen);
                return (
                  <Marker key={b.boutiqueId} position={[b.location!.lat, b.location!.lng]} icon={icon}>
                    <Popup maxWidth={290}>
                      <div className="min-w-[230px]">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '25' }}>
                            <svg width="16" height="16" viewBox="0 0 80 80" fill="none">
                              <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
                              <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                              <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900">{b.nom}</p>
                            <p className="text-xs text-gray-500">{b.adresse || b.location?.city || '—'}</p>
                          </div>
                        </div>

                        {/* Location precision badge */}
                        <div className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full mb-2 ${isApprox ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                          {isApprox ? <Wifi className="w-2.5 h-2.5" /> : <MapPin className="w-2.5 h-2.5" />}
                          {isApprox ? `${t('superadmin.mapApproxBadge')}${b.location?.city ? ` — ${b.location.city}` : ''}` : t('superadmin.mapPreciseBadge')}
                        </div>

                        <div className="space-y-1 text-xs text-gray-700 border-t border-gray-100 pt-2">
                          <div className="flex justify-between"><span className="text-gray-500">{t('superadmin.detailStatRevenue')}</span><span className="font-semibold">{fmtFCFA(b.stats?.totalRevenue ?? 0)}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">{t('superadmin.detailStatSales')}</span><span>{(b.stats?.totalVentes ?? 0).toLocaleString()}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">{t('superadmin.detailStatUsers')}</span><span>{b.stats?.totalUsers ?? '—'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">{t('superadmin.detailStatProducts')}</span><span>{b.stats?.totalProducts ?? '—'}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">{t('superadmin.detailVersionLabel')}</span><span className="font-mono">v{b.version}</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">{t('superadmin.detailLastSeen')}</span><span>{fmtDate(lastSeen)}</span></div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MarkerClusterGroup>
          )}
        </MapContainer>
      )}

      {/* Boutiques without location */}
      {withoutLocation.length > 0 && (
        <div className="p-3 border-t border-border/60 bg-amber-50/50">
          <p className="text-xs text-amber-700 font-medium mb-1.5">
            {t('superadmin.mapWithoutLoc').replace('{n}', String(withoutLocation.length))}
          </p>
          <div className="flex flex-wrap gap-1">
            {withoutLocation.map(b => (
              <span key={b.boutiqueId} className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                {b.nom}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
