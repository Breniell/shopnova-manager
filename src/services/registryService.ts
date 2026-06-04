/**
 * Legwan Platform Registry
 *
 * Each boutique reports anonymised aggregate stats + automatic geolocation
 * to registry/{boutiqueId} in Firestore at every startup.
 *
 * Geolocation strategy (automatic, no user action required):
 *   1. IP geolocation  — instant, city-level accuracy, no permission needed
 *   2. Nominatim       — street-level accuracy when address is filled in settings
 * The best available location is stored; Nominatim upgrades IP coords when possible.
 */
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { getBoutiqueId } from '@/services/boutiqueService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useSupplierStore } from '@/stores/useSupplierStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useExpenseStore } from '@/stores/useExpenseStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';

const APP_VERSION = '1.4.2';

// ─── Types ───────────────────────────────────────────────────────────────────

export type LocationSource = 'ip' | 'address' | 'nominatim';

export interface RegistryLocation {
  lat: number;
  lng: number;
  geocodedAt: string;
  source: LocationSource;
  city?: string;
  country?: string;
  precision: 'city' | 'street'; // ip = city, nominatim/address = street
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
  stats: {
    totalVentes: number;
    totalRevenue: number;
    totalProducts: number;
    totalUsers: number;
    totalCustomers: number;
    totalSuppliers: number;
    totalExpenses: number;
    totalSessions: number;
  };
  location: RegistryLocation | null;
  adresseForGeocode?: string;
}

// ─── Platform detection ───────────────────────────────────────────────────────

function getPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

// ─── Geolocation — Level 1: IP-based (automatic, no user action) ─────────────

interface IpGeoResult {
  lat: number;
  lng: number;
  city?: string;
  country?: string;
}

async function fetchIpGeo(url: string, parse: (d: Record<string, unknown>) => IpGeoResult | null): Promise<IpGeoResult | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return parse(data);
  } catch {
    return null;
  }
}

async function getIpLocation(): Promise<RegistryLocation | null> {
  // Try multiple free IP geolocation services (HTTPS, no API key)
  const services: Array<{
    url: string;
    parse: (d: Record<string, unknown>) => IpGeoResult | null;
  }> = [
    {
      url: 'https://ipwho.is/',
      parse: d => d.success && typeof d.latitude === 'number' && typeof d.longitude === 'number'
        ? { lat: d.latitude as number, lng: d.longitude as number, city: d.city as string, country: d.country as string }
        : null,
    },
    {
      url: 'https://ipapi.co/json/',
      parse: d => typeof d.latitude === 'number' && typeof d.longitude === 'number'
        ? { lat: d.latitude as number, lng: d.longitude as number, city: d.city as string, country: d.country_name as string }
        : null,
    },
    {
      url: 'https://geolocation-db.com/json/',
      parse: d => typeof d.latitude === 'number' && typeof d.longitude === 'number'
        ? { lat: d.latitude as number, lng: d.longitude as number, city: d.city as string, country: d.country_name as string }
        : null,
    },
  ];

  for (const svc of services) {
    const result = await fetchIpGeo(svc.url, svc.parse);
    if (result) {
      return {
        lat: result.lat,
        lng: result.lng,
        geocodedAt: new Date().toISOString(),
        source: 'ip',
        precision: 'city',
        city: result.city,
        country: result.country,
      };
    }
  }
  return null;
}

// ─── Geolocation — Level 2: Address via Nominatim (street-level) ─────────────

async function geocodeAddress(adresse: string, nom: string): Promise<RegistryLocation | null> {
  if (!adresse?.trim()) return null;
  try {
    const query = encodeURIComponent(`${adresse}, ${nom}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&addressdetails=1`,
      {
        headers: { 'User-Agent': `Legwan/${APP_VERSION} (support@legwan.cm)` },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const results = await res.json() as Array<{ lat: string; lon: string; address?: { city?: string; town?: string; country?: string } }>;
    if (!results.length) return null;
    const r = results[0];
    return {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      geocodedAt: new Date().toISOString(),
      source: 'nominatim',
      precision: 'street',
      city: r.address?.city ?? r.address?.town,
      country: r.address?.country,
    };
  } catch {
    return null;
  }
}

// ─── Registry heartbeat ───────────────────────────────────────────────────────

/**
 * Sends a heartbeat to registry/{boutiqueId} in Firestore.
 *
 * Geolocation logic:
 * - On first run: get IP location immediately (automatic), then try Nominatim upgrade
 * - On subsequent runs: keep existing location unless address changed (re-geocode)
 * - IP location is always refreshed to track machine moves
 * - Nominatim (street-level) takes priority over IP (city-level) when available
 *
 * Fire-and-forget — never throws.
 */
export async function sendRegistryHeartbeat(isRecoveryEnabled: boolean): Promise<void> {
  if (!isFirebaseConfigured) return;

  try {
    const boutiqueId = getBoutiqueId();
    const docRef = doc(db, `registry/${boutiqueId}`);

    const settings = useSettingsStore.getState().shop;
    const users = useAuthStore.getState().users;
    const products = useProductStore.getState().products;
    const { sales } = useSaleStore.getState();
    const customers = useCustomerStore.getState().customers;
    const suppliers = useSupplierStore.getState().suppliers;
    const expenses = useExpenseStore.getState().expenses;
    const sessions = useCashSessionStore.getState().sessions;

    const totalRevenue = sales
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + (s.total ?? s.subtotal ?? 0), 0);

    // ── Geolocation strategy ──────────────────────────────────────────────────
    let location: RegistryLocation | null = null;
    const adresseKey = `${settings.nom}::${settings.adresse}`;

    try {
      const snap = await getDoc(docRef);
      const existing = snap.exists() ? (snap.data() as RegistryEntry) : null;

      if (existing?.location?.precision === 'street' && existing.adresseForGeocode === adresseKey) {
        // Keep precise street-level location — don't re-geocode if address unchanged
        location = existing.location;
      } else {
        // Step 1: Get IP location immediately (automatic, no user input needed)
        const ipLoc = await getIpLocation();

        // Step 2: Try to upgrade to street-level via Nominatim if address is set
        const nominatimLoc = settings.adresse?.trim()
          ? await geocodeAddress(settings.adresse, settings.nom)
          : null;

        // Nominatim (street) > IP (city) — use best available
        location = nominatimLoc ?? ipLoc ?? existing?.location ?? null;
      }
    } catch {
      // Offline — try IP geolocation anyway (it works independently of Firestore)
      location = await getIpLocation().catch(() => null);
    }

    // ── Build entry ───────────────────────────────────────────────────────────
    const entry: Omit<RegistryEntry, 'registeredAt'> = {
      boutiqueId,
      nom: settings.nom || 'Boutique sans nom',
      adresse: settings.adresse || '',
      telephone: settings.telephone || '',
      version: APP_VERSION,
      platform: getPlatform(),
      lastSeen: Timestamp.now(),
      isRecoveryEnabled,
      stats: {
        totalVentes: sales.filter(s => s.status === 'completed').length,
        totalRevenue,
        totalProducts: products.length,
        totalUsers: users.length,
        totalCustomers: customers.filter(c => !c.archived).length,
        totalSuppliers: suppliers.length,
        totalExpenses: expenses.length,
        totalSessions: sessions.length,
      },
      location,
      adresseForGeocode: adresseKey,
    };

    await setDoc(docRef, { ...entry, registeredAt: Timestamp.now() }, { merge: true });
    // Ensure registeredAt is only set once (merge preserves existing value)
    await setDoc(docRef, { lastSeen: Timestamp.now() }, { merge: true });

  } catch (err) {
    console.warn('[registry] heartbeat failed:', err);
  }
}
