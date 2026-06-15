/**
 * Interactive map picker — lets the merchant drag a marker to their exact
 * shop location, with optional neighbourhood / landmark text fields.
 *
 * Uses react-leaflet (already bundled for the super-admin map).
 * Rendered conditionally so Leaflet only initialises when the card is open.
 */
import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { useTranslation } from '@/i18n';
import type { RegistryLocation } from '@/services/registryService';

interface Props {
  initialLocation: RegistryLocation | null;
  onConfirm: (lat: number, lng: number, quartier?: string, pointDeRepere?: string) => void;
  onCancel: () => void;
}

// Yaoundé — default centre when no position is known
const DEFAULT_CENTER: [number, number] = [3.87, 11.52];
const ZOOM_COUNTRY   = 6;
const ZOOM_STREET    = 15;

function createPickerIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize:   [40, 54],
    iconAnchor: [20, 54],
    html: `<div style="
        position:relative;width:40px;height:40px;
        border-radius:50% 50% 50% 0;
        background:#A93200;
        transform:rotate(-45deg);
        box-shadow:0 4px 16px rgba(169,50,0,0.5);
        border:2.5px solid white;
        cursor:grab;">
      <div style="transform:rotate(45deg);display:flex;align-items:center;justify-content:center;width:100%;height:100%;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    </div>`,
  });
}

// Centers the map on mount — must be a child of MapContainer
function SetView({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  React.useEffect(() => { map.setView([lat, lng], zoom); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const LocationPicker: React.FC<Props> = ({ initialLocation, onConfirm, onCancel }) => {
  const { t } = useTranslation();

  const hasInitial    = initialLocation != null;
  const isManual      = initialLocation?.source === 'manual';

  const [lat,           setLat]           = useState(initialLocation?.lat ?? DEFAULT_CENTER[0]);
  const [lng,           setLng]           = useState(initialLocation?.lng ?? DEFAULT_CENTER[1]);
  const [quartier,      setQuartier]      = useState(initialLocation?.quartier      ?? '');
  const [pointDeRepere, setPointDeRepere] = useState(initialLocation?.pointDeRepere ?? '');

  const initialZoom = hasInitial ? ZOOM_STREET : ZOOM_COUNTRY;

  // Stable icon instance — recreating it on every render causes Leaflet warnings
  const [pickerIcon] = useState(() => createPickerIcon());

  return (
    <div className="space-y-3">
      {/* Banner: only shown when starting from an auto-detected (non-manual) position */}
      {!isManual && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
          {t('settings.location.mapHint')}
        </div>
      )}

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-border" style={{ height: '320px' }}>
        <MapContainer
          center={[lat, lng]}
          zoom={initialZoom}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SetView lat={lat} lng={lng} zoom={initialZoom} />
          <Marker
            draggable
            position={[lat, lng]}
            icon={pickerIcon}
            eventHandlers={{
              dragend(e) {
                const marker = e.target as L.Marker;
                const pos = marker.getLatLng();
                setLat(pos.lat);
                setLng(pos.lng);
              },
            }}
          />
        </MapContainer>
      </div>

      {/* Coordinates readout */}
      <p className="text-[10px] font-mono text-muted-foreground text-center">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>

      {/* Optional text fields */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('settings.location.quartierLabel')}
          </label>
          <input
            type="text"
            value={quartier}
            onChange={e => setQuartier(e.target.value)}
            className="nova-input w-full"
            placeholder={t('settings.location.quartierPlaceholder')}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('settings.location.pointLabel')}
          </label>
          <input
            type="text"
            value={pointDeRepere}
            onChange={e => setPointDeRepere(e.target.value)}
            className="nova-input w-full"
            placeholder={t('settings.location.pointPlaceholder')}
          />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {t('settings.location.consentNote')}
      </p>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors text-sm"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={() => onConfirm(lat, lng, quartier || undefined, pointDeRepere || undefined)}
          className="flex-1 nova-btn-primary py-2.5 text-sm"
        >
          {t('settings.location.confirmBtn')}
        </button>
      </div>
    </div>
  );
};

export default LocationPicker;
