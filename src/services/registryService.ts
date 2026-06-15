/**
 * Legwan Platform Registry
 *
 * Sends health signals + automatic geolocation to registry/{boutiqueId}.
 * No financial data is ever transmitted (no revenue, sales amounts, product counts, etc.).
 * Geolocation uses a GPS lock strategy: once a precise GPS fix is obtained,
 * it is stored in localStorage and reused on every subsequent startup.
 *
 * Data transmitted per boutique:
 *   - name, address, phone (from shop settings)
 *   - app version, platform
 *   - isActive (boolean: any completed sale in the last 30 days)
 *   - usersCount (number of user accounts)
 *   - lastActivityAt (date of most recent sale — no amounts)
 *   - location (lat/lng/city/country — only with explicit geo consent)
 *
 * NOT transmitted: revenue, sale amounts, products, customers, suppliers, expenses.
 */
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { getBoutiqueId } from '@/services/boutiqueService';
import {
  getGPSLocationRobust,
  getIPLocation,
  getAddressFromCoords,
  reverseGeocode,
} from '@/services/geoService';
import { hasGeoConsent } from '@/lib/consent';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { LocationSource, LocationPrecision } from '@/services/geoService';

const APP_VERSION = '1.5.0';

export type { LocationSource, LocationPrecision };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegistryLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  geocodedAt: string;
  capturedAt: string;
  source: LocationSource;
  precision: LocationPrecision;
  city?: string;
  country?: string;
  locked: boolean;
  /** Neighbourhood name entered by the merchant (manual placement only). */
  quartier?: string;
  /** Nearby landmark entered by the merchant (manual placement only). */
  pointDeRepere?: string;
}

export interface RegistryHealth {
  isActive: boolean;
  usersCount: number;
  lastActivityAt: string | null;
  appVersion: string;
}

export interface RegistryEntry {
  boutiqueId: string;
  nom: string;
  adresse: string;
  telephone: string;
  version: string;
  platform: string;
  registeredAt: Timestamp;
  lastSeen: Timestamp;
  isRecoveryEnabled: boolean;
  health: RegistryHealth;
  location: RegistryLocation | null;
  // Legacy field — present in pre-migration Firestore docs; never written from this version
  stats?: Record<string, number>;
}

// ─── Platform helper ──────────────────────────────────────────────────────────

function getPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

// ─── GPS lock — localStorage persistence ─────────────────────────────────────

const GEO_LOCK_KEY = 'legwan-geo-lock';

function loadLockedPosition(): RegistryLocation | null {
  try {
    const raw = localStorage.getItem(GEO_LOCK_KEY);
    return raw ? (JSON.parse(raw) as RegistryLocation) : null;
  } catch { return null; }
}

function saveLockedPosition(loc: RegistryLocation): void {
  try { localStorage.setItem(GEO_LOCK_KEY, JSON.stringify(loc)); } catch { /* ignore */ }
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

/**
 * Sends a health heartbeat to registry/{boutiqueId}.
 * No financial data is included.
 * Geo lock strategy: reuse localStorage lock → try GPS → IP fallback.
 * Fire-and-forget — never throws.
 */
export async function sendRegistryHeartbeat(isRecoveryEnabled: boolean): Promise<void> {
  if (!isFirebaseConfigured) return;

  try {
    const boutiqueId = getBoutiqueId();
    const docRef = doc(db, `registry/${boutiqueId}`);

    const settings = useSettingsStore.getState().shop;
    const users    = useAuthStore.getState().users;
    const { sales } = useSaleStore.getState();

    // Health: activity signals only — no financial data
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const completedSales = sales.filter(s => s.status === 'completed');
    const isActive = completedSales.some(s => new Date(s.date).getTime() >= thirtyDaysAgo);
    const latestSale = completedSales.reduce<typeof completedSales[0] | null>((acc, s) => {
      if (!acc) return s;
      return new Date(s.date) > new Date(acc.date) ? s : acc;
    }, null);

    const health: RegistryHealth = {
      isActive,
      usersCount: users.length,
      lastActivityAt: latestSale?.date instanceof Date ? latestSale.date.toISOString() : (latestSale?.date ?? null),
      appVersion: APP_VERSION,
    };

    // Geolocation — only if the user has explicitly consented
    let location: RegistryLocation | null = null;
    if (hasGeoConsent()) {
      const stored = loadLockedPosition();
      // 1. Manual placement: merchant placed the pin themselves — always authoritative
      if (stored?.source === 'manual') {
        location = stored;
      // 2. Reuse locked GPS position from localStorage — never re-query once locked
      } else if (stored?.locked) {
        location = stored;
      } else {
        // 2. Try robust GPS (watchPosition up to 25 s, stop early at < 50 m accuracy)
        const gps = await getGPSLocationRobust(25_000, 50);
        if (gps) {
          const now = new Date().toISOString();
          const newLoc: RegistryLocation = {
            lat: gps.lat,
            lng: gps.lng,
            accuracy: gps.accuracy,
            geocodedAt: now,
            capturedAt: now,
            source: 'gps',
            precision: 'gps',
            locked: true,
          };

          // Enrich with city/country via reverse geocode
          try {
            const geocoded = await reverseGeocode(gps.lat, gps.lng);
            if (geocoded) {
              newLoc.city = geocoded.city;
              newLoc.country = geocoded.country;
            }
          } catch { /* non-fatal */ }

          // Auto-fill boutique address if not set
          if (!settings.adresse?.trim()) {
            try {
              const addr = await getAddressFromCoords(gps.lat, gps.lng);
              if (addr) useSettingsStore.getState().updateShop({ adresse: addr });
            } catch { /* non-fatal */ }
          }

          saveLockedPosition(newLoc);
          location = newLoc;
        } else {
          // 3. IP fallback — locked: false so GPS is retried next startup
          const ip = await getIPLocation();
          if (ip) {
            location = {
              lat: ip.lat,
              lng: ip.lng,
              geocodedAt: new Date().toISOString(),
              capturedAt: new Date().toISOString(),
              source: 'ip',
              precision: 'city',
              city: ip.city,
              country: ip.country,
              locked: false,
            };
          }
        }
      }
    }

    const entry: Omit<RegistryEntry, 'registeredAt' | 'stats'> = {
      boutiqueId,
      nom: settings.nom || 'Boutique sans nom',
      adresse: settings.adresse || '',
      telephone: settings.telephone || '',
      version: APP_VERSION,
      platform: getPlatform(),
      lastSeen: Timestamp.now(),
      isRecoveryEnabled,
      health,
      location,
    };

    await setDoc(docRef, { ...entry, registeredAt: Timestamp.now() }, { merge: true });

  } catch (err) {
    console.warn('[registry] heartbeat failed:', err);
  }
}

// ─── Manual location helpers (used by boutique settings) ─────────────────────

/** Returns the currently stored location (manual pin, GPS lock, or null). */
export function getStoredLocation(): RegistryLocation | null {
  return loadLockedPosition();
}

/**
 * Persists a manually placed boutique location.
 * source:'manual' + locked:true ensures it is never overwritten by auto-detection.
 */
export function saveManualBoutiqueLocation(
  lat: number,
  lng: number,
  extra?: { quartier?: string; pointDeRepere?: string },
): void {
  const now = new Date().toISOString();
  const loc: RegistryLocation = {
    lat,
    lng,
    geocodedAt: now,
    capturedAt: now,
    source:    'manual',
    precision: 'street',
    locked:    true,
    ...(extra?.quartier      ? { quartier:      extra.quartier }      : {}),
    ...(extra?.pointDeRepere ? { pointDeRepere: extra.pointDeRepere } : {}),
  };
  saveLockedPosition(loc);
}
