/**
 * Carte interactive des installations Legwan.
 *
 * Marqueurs: logo Legwan SVG coloré selon le statut (vert/orange/rouge).
 * Cluster: regroupement automatique des marqueurs proches.
 * Heatmap: cercles semi-transparents dimensionnés par chiffre d'affaires.
 * Contrôle: toggle markers / heatmap.
 */
import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RegistryEntry } from '@/services/registryService';
import { getBoutiqueStatus, STATUS_COLORS } from '@/stores/useSuperAdminStore';
import { cn } from '@/lib/utils';

interface Props {
  boutiques: RegistryEntry[];
}

function toDate(v: unknown): Date {
  if (v && typeof (v as Record<string, unknown>).toDate === 'function') {
    return (v as { toDate(): Date }).toDate();
  }
  if (v instanceof Date) return v;
  return new Date(0);
}

function fmtFCFA(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

function fmtDate(d: Date): string {
  if (d.getTime() === 0) return '—';
  return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Create a custom Legwan-logo divIcon for a given status color */
function createLegwanIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [44, 52],
    iconAnchor: [22, 52],
    popupAnchor: [0, -54],
    html: `
      <div style="
        width:44px; height:44px; border-radius:12px;
        background:${color};
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 4px 14px rgba(0,0,0,0.35);
        border:2.5px solid rgba(255,255,255,0.35);
        position:relative;
      ">
        <svg width="26" height="26" viewBox="0 0 80 80" fill="none">
          <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42"
            stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="20" y1="13" x2="20" y2="60" stroke="white" stroke-width="6" stroke-linecap="round"/>
          <line x1="20" y1="60" x2="34" y2="60" stroke="white" stroke-width="6" stroke-linecap="round"/>
        </svg>
        <div style="
          position:absolute; bottom:-10px; left:50%; transform:translateX(-50%);
          width:0; height:0;
          border-left:9px solid transparent;
          border-right:9px solid transparent;
          border-top:10px solid ${color};
        "></div>
      </div>
    `,
  });
}

/** Custom cluster icon with Legwan brand */
function createClusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount();
  return L.divIcon({
    className: '',
    iconSize: [50, 50],
    html: `
      <div style="
        width:50px; height:50px; border-radius:50%;
        background:#A93200;
        display:flex; align-items:center; justify-content:center;
        flex-direction:column;
        box-shadow:0 4px 14px rgba(169,50,0,0.4);
        border:3px solid rgba(255,255,255,0.4);
        color:white; font-weight:700; font-size:14px;
        font-family:'Space Grotesk', sans-serif;
      ">
        ${count}
      </div>
    `,
  });
}

type MapMode = 'markers' | 'heatmap' | 'both';

export const SAMap: React.FC<Props> = ({ boutiques }) => {
  const [mode, setMode] = useState<MapMode>('both');

  const geolocated = useMemo(
    () => boutiques.filter(b => b.location?.lat && b.location?.lng),
    [boutiques]
  );

  const maxRevenue = useMemo(
    () => Math.max(...geolocated.map(b => b.stats?.totalRevenue ?? 0), 1),
    [geolocated]
  );

  // Default center: Cameroun (midpoint of likely installs)
  const center: [number, number] = [3.87, 11.52];

  const modeBtn = (m: MapMode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        mode === m
          ? 'bg-primary text-primary-foreground shadow'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="nova-card overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Carte des installations
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {geolocated.length} sur {boutiques.length} boutiques géolocalisées
          </p>
        </div>
        <div className="flex gap-2">
          {modeBtn('markers', 'Marqueurs')}
          {modeBtn('heatmap', 'Heatmap CA')}
          {modeBtn('both',    'Les deux')}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border/60 bg-muted/30">
        {(Object.entries(STATUS_COLORS) as [string, string][]).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-sm flex items-center justify-center"
              style={{ backgroundColor: color + '25' }}
            >
              <svg width="10" height="10" viewBox="0 0 80 80" fill="none">
                <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke={color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="8" strokeLinecap="round"/>
                <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-[10px] text-muted-foreground capitalize">{status}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-primary/20 border border-primary/40" />
          <span className="text-[10px] text-muted-foreground">Heatmap CA</span>
        </div>
      </div>

      {/* Map */}
      {geolocated.length === 0 ? (
        <div className="h-96 flex items-center justify-center bg-muted/20">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Aucune boutique géolocalisée</p>
            <p className="text-xs text-muted-foreground mt-1">
              Les coordonnées sont calculées depuis l'adresse saisie dans les Paramètres.
            </p>
          </div>
        </div>
      ) : (
        <MapContainer
          center={center}
          zoom={6}
          style={{ height: '520px', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Heatmap circles */}
          {(mode === 'heatmap' || mode === 'both') && geolocated.map(b => {
            const revenue = b.stats?.totalRevenue ?? 0;
            const radius = 2000 + (revenue / maxRevenue) * 40_000;
            const opacity = 0.08 + (revenue / maxRevenue) * 0.22;
            const status = getBoutiqueStatus(toDate(b.lastSeen));
            const color = STATUS_COLORS[status];
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
            <MarkerClusterGroup
              iconCreateFunction={createClusterIcon}
              maxClusterRadius={60}
              showCoverageOnHover={false}
            >
              {geolocated.map(b => {
                const status = getBoutiqueStatus(toDate(b.lastSeen));
                const color  = STATUS_COLORS[status];
                const lastSeen = toDate(b.lastSeen);
                return (
                  <Marker
                    key={b.boutiqueId}
                    position={[b.location!.lat, b.location!.lng]}
                    icon={createLegwanIcon(color)}
                  >
                    <Popup maxWidth={280}>
                      <div className="min-w-[220px]">
                        {/* Popup header */}
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: color + '25' }}
                          >
                            <svg width="16" height="16" viewBox="0 0 80 80" fill="none">
                              <path d="M 54,14 A 22,22 0 1,0 54,60 L 54,42 L 40,42" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
                              <line x1="20" y1="13" x2="20" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                              <line x1="20" y1="60" x2="34" y2="60" stroke={color} strokeWidth="7" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900">{b.nom}</p>
                            <p className="text-xs text-gray-500">{b.adresse}</p>
                          </div>
                        </div>

                        <div className="space-y-1 text-xs text-gray-700 border-t border-gray-100 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span className="text-gray-500">CA total</span>
                            <span className="font-semibold">{fmtFCFA(b.stats?.totalRevenue ?? 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Ventes</span>
                            <span>{(b.stats?.totalVentes ?? 0).toLocaleString('fr-FR')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Utilisateurs</span>
                            <span>{b.stats?.totalUsers ?? '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Produits</span>
                            <span>{b.stats?.totalProducts ?? '—'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Version</span>
                            <span className="font-mono">v{b.version}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Dernière activité</span>
                            <span>{fmtDate(lastSeen)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Statut</span>
                            <span className="font-semibold" style={{ color }}>{status}</span>
                          </div>
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
    </div>
  );
};
