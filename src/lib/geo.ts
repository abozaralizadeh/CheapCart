import type { Area, Point } from "./types";

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in km. */
export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizePostcode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function findPostcode(areas: Area[], code: string): { area: Area; point: Point } | null {
  const want = normalizePostcode(code);
  if (!want) return null;
  for (const area of areas) {
    const hit = area.postcodes.find((p) => normalizePostcode(p.code) === want);
    if (hit) return { area, point: { lat: hit.lat, lng: hit.lng } };
  }
  return null;
}

/** True when the point is within coverageKm of any postcode centre of the area. */
export function areaCovers(area: Area, point: Point): boolean {
  return area.postcodes.some((p) => distanceKm(p, point) <= area.coverageKm);
}

export function findAreaForPoint(areas: Area[], point: Point): Area | null {
  let best: { area: Area; d: number } | null = null;
  for (const area of areas) {
    if (!areaCovers(area, point)) continue;
    const d = distanceKm(area.center, point);
    if (!best || d < best.d) best = { area, d };
  }
  return best ? best.area : null;
}
