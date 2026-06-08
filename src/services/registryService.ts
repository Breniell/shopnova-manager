/**
 * Legwan Platform Registry
 *
 * Sends aggregate stats + automatic geolocation to registry/{boutiqueId}.
 * Geolocation is handled by geoService (GPS → IP fallback).
 */
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { getBoutiqueId } from '@/services/boutiqueService';
import { getBestLocation, getAddressFromCoords } from '@/services/geoService';
import { hasGeoConsent } from '@/lib/consent';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProductStore } from '@/stores/useProductStore';
import { useSaleStore } from '@/stores/useSaleStore';
import { useCustomerStore } from '@/stores/useCustomerStore';
import { useSupplierStore } from '@/stores/useSupplierStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useExpenseStore } from '@/stores/useExpenseStore';
import { useCashSessionStore } from '@/stores/useCashSessionStore';
import type { LocationSource, LocationPrecision } from '@/services/geoService';

const APP_VERSION = '1.4.4';

export type { LocationSource, LocationPrecision };

export interface RegistryLocation {
  lat: number;
  lng: number;
  geocodedAt: string;
  source: LocationSource;
  precision: LocationPrecision;
  city?: string;
  country?: string;
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
}

function getPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

/**
 * Sends a heartbeat to registry/{boutiqueId}.
 * GPS is tried first; if unavailable, IP geolocation is used as fallback.
 * Fire-and-forget — never throws.
 */
export async function sendRegistryHeartbeat(isRecoveryEnabled: boolean): Promise<void> {
  if (!isFirebaseConfigured) return;

  try {
    const boutiqueId = getBoutiqueId();
    const docRef = doc(db, `registry/${boutiqueId}`);

    const settings = useSettingsStore.getState().shop;
    const users    = useAuthStore.getState().users;
    const products = useProductStore.getState().products;
    const { sales } = useSaleStore.getState();
    const customers = useCustomerStore.getState().customers;
    const suppliers = useSupplierStore.getState().suppliers;
    const expenses  = useExpenseStore.getState().expenses;
    const sessions  = useCashSessionStore.getState().sessions;

    const totalRevenue = sales
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + (s.total ?? s.subtotal ?? 0), 0);

    // Geolocation: only if the user has explicitly consented (separate opt-in).
    // Without consent, no GPS/IP request is made and no location is transmitted.
    let location: RegistryLocation | null = null;
    if (hasGeoConsent()) {
      try {
        const snap = await getDoc(docRef);
        const existing = snap.exists() ? (snap.data() as RegistryEntry) : null;

        // Keep existing GPS-precision location (don't re-request GPS every startup)
        if (existing?.location?.precision === 'gps') {
          location = existing.location;
        } else {
          const geo = await getBestLocation();
          if (geo) {
            location = {
              lat: geo.lat,
              lng: geo.lng,
              geocodedAt: new Date().toISOString(),
              source: geo.source,
              precision: geo.precision,
              city: geo.city,
              country: geo.country,
            };

            // Auto-fill boutique address from GPS if not yet set
            if (geo.precision === 'gps' && !settings.adresse?.trim()) {
              const addr = await getAddressFromCoords(geo.lat, geo.lng);
              if (addr) {
                useSettingsStore.getState().updateShop({ adresse: addr });
              }
            }
          } else {
            location = existing?.location ?? null;
          }
        }
      } catch {
        const geo = await getBestLocation().catch(() => null);
        if (geo) {
          location = {
            lat: geo.lat, lng: geo.lng,
            geocodedAt: new Date().toISOString(),
            source: geo.source, precision: geo.precision,
            city: geo.city, country: geo.country,
          };
        }
      }
    }

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
    };

    await setDoc(docRef, { ...entry, registeredAt: Timestamp.now() }, { merge: true });
    await setDoc(docRef, { lastSeen: Timestamp.now() }, { merge: true });

  } catch (err) {
    console.warn('[registry] heartbeat failed:', err);
  }
}