/**
 * Legwan Platform Registry
 *
 * Each boutique installation reports anonymized aggregate stats to
 * platform/registry/{boutiqueId} in Firestore.  Only the developer
 * (superadmin) can read across all boutiques; each boutique can only
 * write its own entry.
 *
 * Called once per app bootstrap (after Firebase is ready and stores are loaded).
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

const APP_VERSION = '1.4.1';

export interface RegistryLocation {
  lat: number;
  lng: number;
  geocodedAt: string;
  source: 'nominatim';
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

function getPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'web';
}

async function geocodeAddress(adresse: string, nom: string): Promise<RegistryLocation | null> {
  if (!adresse?.trim()) return null;
  try {
    const query = encodeURIComponent(`${adresse}, ${nom}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'User-Agent': `Legwan/${APP_VERSION} (support@legwan.cm)` } }
    );
    if (!res.ok) return null;
    const results = await res.json() as Array<{ lat: string; lon: string }>;
    if (!results.length) return null;
    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
      geocodedAt: new Date().toISOString(),
      source: 'nominatim',
    };
  } catch {
    return null;
  }
}

/**
 * Send a heartbeat to the platform registry.
 * Geocodes address on first run or when address has changed.
 * Fire-and-forget â€” never throws.
 */
export async function sendRegistryHeartbeat(isRecoveryEnabled: boolean): Promise<void> {
  if (!isFirebaseConfigured) return;

  try {
    const boutiqueId = getBoutiqueId();
    const docRef = doc(db, `platform/registry/${boutiqueId}`);

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

    // Load existing entry to decide whether to re-geocode
    let location: RegistryLocation | null = null;
    const adresseKey = `${settings.nom}::${settings.adresse}`;
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const existing = snap.data() as RegistryEntry;
        if (existing.location && existing.adresseForGeocode === adresseKey) {
          location = existing.location;
        }
        if (!location && settings.adresse?.trim()) {
          location = await geocodeAddress(settings.adresse, settings.nom);
        }
      } else {
        // First time â€” geocode now
        location = await geocodeAddress(settings.adresse, settings.nom);
      }
    } catch {
      // Offline â€” skip geocoding
    }

    const entry: Omit<RegistryEntry, 'boutiqueId'> = {
      nom: settings.nom || 'Boutique sans nom',
      adresse: settings.adresse || '',
      telephone: settings.telephone || '',
      version: APP_VERSION,
      platform: getPlatform(),
      registeredAt: Timestamp.now(), // will be overwritten by merge if already exists
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

    // Use set with merge so registeredAt is only written once
    await setDoc(docRef, {
      ...entry,
      boutiqueId,
    }, { merge: true });

    // Ensure registeredAt is only set on first write
    await setDoc(docRef, { lastSeen: Timestamp.now() }, { merge: true });
  } catch (err) {
    // Never let registry failures crash the app
    console.warn('[registry] heartbeat failed:', err);
  }
}

