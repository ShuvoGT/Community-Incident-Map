import { latLngToCell, cellToLatLng, cellToBoundary } from "h3-js";

// Resolution 9 grid for the pilot (see IMPLEMENTATION_PLAN.md §4).
export const H3_RESOLUTION = 9;

// Rough Dhaka launch bounding box. This is a coarse pre-check; the precise
// launch boundary is a PostGIS polygon in `configuration` and is applied
// server-side before a submission is accepted.
const DHAKA_BBOX = {
  minLat: 23.66,
  maxLat: 23.95,
  minLng: 90.32,
  maxLng: 90.52,
};

export function isWithinLaunchArea(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= DHAKA_BBOX.minLat &&
    lat <= DHAKA_BBOX.maxLat &&
    lng >= DHAKA_BBOX.minLng &&
    lng <= DHAKA_BBOX.maxLng
  );
}

// Derive the H3 cell server-side. The raw coordinate must be discarded after
// this conversion — only the cell id is persisted for public use.
export function deriveCell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, H3_RESOLUTION);
}

export function cellCenter(cell: string): { lat: number; lng: number } {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

// GeoJSON Polygon ([lng, lat] ring) for a cell boundary.
export function cellBoundaryGeoJson(cell: string): {
  type: "Polygon";
  coordinates: [number, number][][];
} {
  const ring = cellToBoundary(cell, true).map(
    ([lng, lat]) => [lng, lat] as [number, number],
  );
  return { type: "Polygon", coordinates: [ring] };
}
