function parseGeocodeResult(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number.parseFloat(value.lat || '');
  const lon = Number.parseFloat(value.lon || '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocodeAddress(address) {
  const trimmed = String(address || '').trim();
  if (!trimmed) throw new Error('Address is required.');

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Address lookup failed (HTTP ${response.status}).`);

  const parsed = await response.json();
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('No location match found for that address.');

  const top = parseGeocodeResult(parsed[0]);
  if (!top) throw new Error('Address lookup returned invalid coordinates.');
  return top;
}

function haversineMiles(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

async function routeDistanceMiles(a, b) {
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}`);
  url.searchParams.set('overview', 'false');
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('steps', 'false');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;

  const parsed = await response.json();
  const meters = parsed.routes?.[0]?.distance;
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  return meters / 1609.344;
}

export async function lookupDrivingDistanceMiles(baseAddress, eventAddress) {
  const [base, event] = await Promise.all([geocodeAddress(baseAddress), geocodeAddress(eventAddress)]);
  const routed = await routeDistanceMiles(base, event);
  if (routed != null && Number.isFinite(routed) && routed >= 0) return routed;
  return haversineMiles(base, event);
}
