/**
 * Legwan Geolocation Service
 *
 * Priority chain (most to least precise):
 *   1. Device GPS/WiFi via navigator.geolocation  — ~5m accuracy
 *   2. IP geolocation                             — city-level fallback
 *
 * Also provides reverse geocoding: (lat, lng) → street address string.
 * Used both for the platform registry heartbeat and for auto-filling
 * the boutique address in settings.
 */

export type LocationSource = 'gps' | 'ip';
export type LocationPrecision = 'gps' | 'city';

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy?: number; // meters, GPS only
  source: LocationSource;
  precision: LocationPrecision;
  city?: string;
  country?: string;
}

export interface AddressResult {
  fullAddress: string;
  road?: string;
  suburb?: string;
  city?: string;
  postcode?: string;
  country?: string;
  countryCode?: string;
}

// ─── GPS via browser geolocation API ─────────────────────────────────────────

export function getGPSLocation(timeoutMs = 12_000): Promise<GeoLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);

    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: 'gps',
          precision: 'gps',
        });
      },
      err => {
        clearTimeout(timer);
        console.warn('[geo] GPS unavailable:', err.message);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 5 * 60 * 1000, // cache 5 min
      }
    );
  });
}

// ─── IP geolocation fallback ──────────────────────────────────────────────────

interface IpResult { lat: number; lng: number; city?: string; country?: string }

async function tryIpService(url: string, parse: (d: unknown) => IpResult | null): Promise<IpResult | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch { return null; }
}

export async function getIPLocation(): Promise<GeoLocation | null> {
  const services: Array<{ url: string; parse: (d: unknown) => IpResult | null }> = [
    {
      url: 'https://ipwho.is/',
      parse: d => {
        const r = d as Record<string, unknown>;
        return r.success && typeof r.latitude === 'number' && typeof r.longitude === 'number'
          ? { lat: r.latitude, lng: r.longitude, city: r.city as string, country: r.country as string }
          : null;
      },
    },
    {
      url: 'https://ipapi.co/json/',
      parse: d => {
        const r = d as Record<string, unknown>;
        return typeof r.latitude === 'number' && typeof r.longitude === 'number'
          ? { lat: r.latitude, lng: r.longitude, city: r.city as string, country: r.country_name as string }
          : null;
      },
    },
    {
      url: 'https://geolocation-db.com/json/',
      parse: d => {
        const r = d as Record<string, unknown>;
        return typeof r.latitude === 'number' && typeof r.longitude === 'number'
          ? { lat: r.latitude, lng: r.longitude, city: r.city as string, country: r.country_name as string }
          : null;
      },
    },
  ];

  for (const svc of services) {
    const result = await tryIpService(svc.url, svc.parse);
    if (result) {
      return {
        lat: result.lat,
        lng: result.lng,
        source: 'ip',
        precision: 'city',
        city: result.city,
        country: result.country,
      };
    }
  }
  return null;
}

// ─── Best available location (GPS first, IP fallback) ────────────────────────

export async function getBestLocation(): Promise<GeoLocation | null> {
  const gps = await getGPSLocation();
  if (gps) return gps;
  return getIPLocation();
}

// ─── Reverse geocoding: (lat, lng) → address ─────────────────────────────────

/**
 * Convert GPS coordinates to a human-readable address using OpenStreetMap Nominatim.
 * zoom=18 = house number level; zoom=16 = street level.
 */
export async function reverseGeocode(lat: number, lng: number, zoom = 18): Promise<AddressResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=${zoom}&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Legwan/1.4.2 (support@legwan.cm)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      display_name?: string;
      error?: string;
      address?: {
        road?: string;
        suburb?: string;
        neighbourhood?: string;
        city?: string;
        town?: string;
        village?: string;
        postcode?: string;
        country?: string;
        country_code?: string;
        house_number?: string;
      };
    };
    if (data.error || !data.display_name) return null;

    const addr = data.address ?? {};
    const city = addr.city ?? addr.town ?? addr.village;
    const road = [addr.house_number, addr.road].filter(Boolean).join(' ');

    return {
      fullAddress: data.display_name,
      road: road || undefined,
      suburb: addr.suburb ?? addr.neighbourhood,
      city,
      postcode: addr.postcode,
      country: addr.country,
      countryCode: addr.country_code?.toUpperCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Build a concise single-line address string from GPS coordinates.
 * Returns something like "Rue de la Joie, Douala, Cameroun".
 */
export async function getAddressFromCoords(lat: number, lng: number): Promise<string | null> {
  const result = await reverseGeocode(lat, lng);
  if (!result) return null;
  const parts = [result.road, result.suburb, result.city, result.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : result.fullAddress;
}
