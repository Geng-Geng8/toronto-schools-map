/** Pure utilities; kept separate so filtering and data integrity can be tested in Node. */
export const BOARD_KEYS = ['TDSB', 'TCDSB'];
export const LEVEL_KEYS = ['Elementary', 'Secondary'];
export const DEFAULT_FILTERS = Object.freeze({ TDSB: true, TCDSB: true, Elementary: true, Secondary: true });

export function normalizeQuery(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}
export function filterSchools(schools, filters = DEFAULT_FILTERS, query = '') {
  const q = normalizeQuery(query);
  return schools.filter(s => filters[s.board] && filters[s.level] && (!q || normalizeQuery(`${s.name} ${s.address}`).includes(q)));
}
export function countSchools(schools) {
  const counts = { total: schools.length, TDSB: 0, TCDSB: 0, Elementary: 0, Secondary: 0 };
  for (const s of schools) { if (s.board in counts) counts[s.board]++; if (s.level in counts) counts[s.level]++; }
  return counts;
}
export function toGeoJSON(schools) {
  return { type: 'FeatureCollection', features: schools.filter(s => Number.isFinite(s.lng) && Number.isFinite(s.lat)).map(s => ({
    type: 'Feature', id: s.id,
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
    properties: { id: s.id, board: s.board, level: s.level, name: s.name }
  })) };
}
export function safeWebsite(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try { const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return ['https:', 'http:'].includes(u.protocol) && u.hostname.includes('.') ? u.href : null;
  } catch { return null; }
}
export function directionsUrl(s) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.name}, ${s.address}`)}`;
}
