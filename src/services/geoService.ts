/**
 * Legwan Geolocation Service
 *
 * Precision chain:
 *   1. Device GPS/WiFi via navigator.geolocation  — ~5–50 m (best)
 *   2. IP geolocation                             — city-level fallback (~1–5 km)
 *
 * getBestLocation()           — awaits the best single result (GPS wins if fast enough)
 * detectAddressProgressively()— calls onUpdate twice: first with IP (instant),
 *                               then upgrades to GPS if it arrives within the timeout.
 * reverseGeocode()            — (lat, lng) → street address via OpenStreetMap Nominatim
 */

export type LocationSource    = 'gps' | 'ip' | 'manual';
export type LocationPrecision = 'gps' | 'city' | 'street';

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy?: number;       // metres, GPS only
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

export function getGPSLocation(timeoutMs = 10_000): Promise<GeoLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 200);

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
        maximumAge: 5 * 60 * 1000,
      }
    );
  });
}

/**
 * Robust GPS capture: watches position for up to `durationMs`,
 * keeping the best reading (lowest accuracy number = most precise).
 * Resolves early if `targetAccuracyM` is reached.
 * Better than getCurrentPosition for indoor/semi-outdoor scenarios.
 */
export function getGPSLocationRobust(
  durationMs = 25_000,
  targetAccuracyM = 50
): Promise<GeoLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);

  return new Promise(resolve => {
    let best: GeolocationPosition | null = null;
    let settled = false;
    let watchId = -1;

    const fromPos = (pos: GeolocationPosition): GeoLocation => ({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      source: 'gps',
      precision: 'gps',
    });

    const finish = (geo: GeoLocation | null) => {
      if (settled) return;
      settled = true;
      try { navigator.geolocation.clearWatch(watchId); } catch { /* ignore */ }
      clearTimeout(timer);
      resolve(geo);
    };

    const timer = setTimeout(() => finish(best ? fromPos(best) : null), durationMs);

    watchId = navigator.geolocation.watchPosition(
      pos => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= targetAccuracyM) finish(fromPos(pos));
      },
      err => {
        console.warn('[geo] watchPosition error:', err.message);
        finish(best ? fromPos(best) : null);
      },
      { enableHighAccuracy: true, timeout: durationMs, maximumAge: 0 }
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
//
// Strategy: start both GPS and IP simultaneously.
// - IP typically resolves in < 1 s → city-level result available immediately.
// - After 2.5 s, if GPS hasn't replied yet, use the IP result so callers don't block.
// - If GPS arrives within 10 s total, it replaces the IP result (more precise).

export async function getBestLocation(): Promise<GeoLocation | null> {
  const ipPromise  = getIPLocation();
  const gpsPromise = getGPSLocation(10_000);

  // Delay the IP result by 2.5 s so GPS has a fair chance to win the race first.
  const ipDelayed = new Promise<GeoLocation | null>(resolve =>
    setTimeout(async () => resolve(await ipPromise), 2500)
  );

  const first = await Promise.race([gpsPromise, ipDelayed]);

  // GPS was fast — return it directly.
  if (first?.source === 'gps') return first;

  // IP result arrived first.  Keep waiting up to 7.5 s more for GPS.
  const gps = await Promise.race([
    gpsPromise,
    new Promise<null>(r => setTimeout(r, 7500)),
  ]);

  return gps ?? first;
}

// ─── Progressive address detection ───────────────────────────────────────────
//
// Calls onUpdate up to twice:
//   1. ~1 s  : IP result (city-level)  — gives the user immediate feedback
//   2. ~3–10 s: GPS result (street-level) — upgrades if the device has location access
//
// Usage:
//   detectAddressProgressively(
//     (addr, precision) => setAddress(addr),
//     6000
//   );

export async function detectAddressProgressively(
  onUpdate: (address: string, precision: LocationPrecision) => void,
  totalTimeoutMs = 10_000
): Promise<void> {
  const gpsPromise = getGPSLocation(totalTimeoutMs);

  // ── Step 1: IP address (fast, city-level) ────────────────────────────────
  const ip = await getIPLocation();
  if (ip) {
    const addr = await getAddressFromCoords(ip.lat, ip.lng);
    if (addr) onUpdate(addr, 'city');
  }

  // ── Step 2: GPS upgrade (precise, street-level) ──────────────────────────
  const remaining = totalTimeoutMs - 2000; // budget after IP round-trip
  const gps = await Promise.race([
    gpsPromise,
    new Promise<null>(r => setTimeout(r, Math.max(remaining, 0))),
  ]);

  if (gps) {
    const addr = await getAddressFromCoords(gps.lat, gps.lng);
    if (addr) onUpdate(addr, 'gps');
  }
}

// ─── Reverse geocoding: (lat, lng) → address ─────────────────────────────────

export async function reverseGeocode(lat: number, lng: number, zoom = 18): Promise<AddressResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=${zoom}&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': `Legwan/${__APP_VERSION__} (support@legwan.cm)` },
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

export async function getAddressFromCoords(lat: number, lng: number): Promise<string | null> {
  const result = await reverseGeocode(lat, lng);
  if (!result) return null;
  const parts = [result.road, result.suburb, result.city, result.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : result.fullAddress;
}
