"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const BAND_COLOR: Record<string, string> = {
  grey: "#c7ccd1",
  yellow: "#f2d35a",
  amber: "#e8963f",
  red: "#d1453b",
};

// A licensed vector basemap is used when a key is configured; otherwise the map
// renders the H3 cells over a plain background (no tiles, no licensing).
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

type Cell = {
  cellId: string;
  count: number;
  band?: "grey" | "yellow" | "amber" | "red";
  center: { lat: number; lng: number };
  boundary: { type: "Polygon"; coordinates: [number, number][][] };
};

type Hotspots = {
  scale: "weekly" | "filtered";
  cells: Cell[];
  dateRange: { start: string; end: string };
  timezone: string;
  ruleVersion?: string;
  generatedAt: string;
};

type AreaSummary = {
  cellId: string;
  count: number;
  band: string | null;
  categoryBreakdown: Record<string, number>;
  timeBreakdown: Record<string, number> | null;
  weaponCount: number;
  injuryCount: number;
};

const CATEGORIES = ["robbery_force", "snatching", "pickpocketing", "other_theft", "attempted"];
const TIME_BANDS = ["band_0_6", "band_6_12", "band_12_18", "band_18_24"];

// Bounding box [[west,south],[east,north]] covering all cell boundaries.
function computeBounds(
  data: Hotspots,
): [[number, number], [number, number]] | null {
  let w = 180,
    s = 90,
    e = -180,
    n = -90;
  let any = false;
  for (const c of data.cells) {
    for (const [lng, lat] of c.boundary.coordinates[0]) {
      any = true;
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return any ? [[w, s], [e, n]] : null;
}

// Build a map-ready GeoJSON FeatureCollection, colouring cells by weekly band
// or (when filtered) on a neutral intensity scale — never the band colours.
function toFeatures(data: Hotspots) {
  const max = Math.max(1, ...data.cells.map((c) => c.count));
  return {
    type: "FeatureCollection" as const,
    features: data.cells.map((c) => {
      const weekly = data.scale === "weekly" && c.band;
      const color = weekly ? BAND_COLOR[c.band!] : "#6fa8e0";
      const opacity = weekly ? 0.6 : 0.25 + 0.5 * (c.count / max);
      return {
        type: "Feature" as const,
        geometry: c.boundary,
        properties: { cellId: c.cellId, count: c.count, color, opacity },
      };
    }),
  };
}

export function HotspotMap() {
  const t = useTranslations("map");
  const tl = useTranslations("labels");
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [category, setCategory] = useState("");
  const [timeBand, setTimeBand] = useState("");
  const [data, setData] = useState<Hotspots | null>(null);
  const [selected, setSelected] = useState<AreaSummary | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [mapFailed, setMapFailed] = useState(false);

  const mapRef = useRef<MlMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef<Hotspots | null>(null);
  const fittedRef = useRef(false);

  // Push the latest data into the map source, whenever both are ready. Called
  // both when data arrives and when the map finishes loading, so neither order
  // loses the update. Fits the viewport to the data once per load.
  const syncData = useCallback(() => {
    const map = mapRef.current;
    const d = dataRef.current;
    if (!map || !d) return;
    const src = map.getSource("cells") as
      | { setData: (x: unknown) => void }
      | undefined;
    if (!src) return;
    src.setData(toFeatures(d));
    if (!fittedRef.current && d.cells.length > 0) {
      const bounds = computeBounds(d);
      if (bounds) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
        fittedRef.current = true;
      }
    }
  }, []);

  const query = () => {
    const p = new URLSearchParams({ window: String(windowDays) });
    if (category) p.set("category", category);
    if (timeBand) p.set("timeBand", timeBand);
    return p.toString();
  };

  // Load hotspot data whenever filters change.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotspots?${query()}`)
      .then((r) => r.json())
      .then((d: Hotspots) => {
        if (cancelled) return;
        dataRef.current = d;
        fittedRef.current = false; // re-fit to the new filtered data
        setData(d);
        syncData();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays, category, timeBand]);

  const openCell = useCallback(
    async (cellId: string) => {
      const r = await fetch(`/api/areas/${cellId}?window=${windowDays}`);
      if (r.ok) setSelected(await r.json());
    },
    [windowDays],
  );

  // Initialise MapLibre for the map view (no basemap tiles: avoids provider
  // licensing; a licensed basemap can be layered in when a key is configured).
  // Cleanup removes the instance so StrictMode's double-invoke and view
  // toggles don't leave orphaned maps.
  useEffect(() => {
    if (view !== "map" || mapFailed || !containerRef.current) return;
    let map: MlMap | null = null;
    let cancelled = false;

    import("maplibre-gl")
      .then(({ Map }) => {
        if (cancelled || !containerRef.current) return;
        map = new Map({
          container: containerRef.current,
          style: MAPTILER_KEY
            ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
            : {
                version: 8,
                sources: {},
                layers: [
                  {
                    id: "bg",
                    type: "background",
                    paint: { "background-color": "#0d0f12" },
                  },
                ],
              },
          center: [90.4074, 23.7806],
          zoom: 10.5,
          attributionControl: MAPTILER_KEY ? undefined : false,
        });
        map.on("load", () => {
          if (cancelled || !map) return;
          map.addSource("cells", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "cells-fill",
            type: "fill",
            source: "cells",
            paint: {
              "fill-color": ["get", "color"],
              "fill-opacity": ["get", "opacity"],
            },
          });
          map.addLayer({
            id: "cells-outline",
            type: "line",
            source: "cells",
            paint: { "line-color": "#ffffff", "line-width": 0.5, "line-opacity": 0.3 },
          });
          map.on("click", "cells-fill", (e) => {
            const f = e.features?.[0];
            if (f) openCell(String(f.properties?.cellId));
          });
          mapRef.current = map;
          syncData();
        });
      })
      .catch(() => setMapFailed(true));

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mapFailed]);

  // Push new data into the map source when it changes.
  useEffect(() => {
    syncData();
  }, [data, syncData]);

  return (
    <div>
      <div className="filters">
        <div className="seg">
          <button
            className={windowDays === 7 ? "btn" : "btn secondary"}
            onClick={() => setWindowDays(7)}
            type="button"
          >
            {t("last7")}
          </button>
          <button
            className={windowDays === 30 ? "btn" : "btn secondary"}
            onClick={() => setWindowDays(30)}
            type="button"
          >
            {t("last30")}
          </button>
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("allCategories")}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tl(`category.${c}`)}
            </option>
          ))}
        </select>
        <select value={timeBand} onChange={(e) => setTimeBand(e.target.value)}>
          <option value="">{t("anyTime")}</option>
          {TIME_BANDS.map((b) => (
            <option key={b} value={b}>
              {tl(`timeBand.${b}`)}
            </option>
          ))}
        </select>
        <div className="seg" role="tablist" aria-label="View">
          <button
            className={view === "map" ? "btn" : "btn secondary"}
            onClick={() => setView("map")}
            type="button"
          >
            {t("map")}
          </button>
          <button
            className={view === "list" ? "btn" : "btn secondary"}
            onClick={() => setView("list")}
            type="button"
          >
            {t("list")}
          </button>
        </div>
      </div>

      {data && data.scale === "filtered" && (
        <p className="notice">{t("filteredNotice")}</p>
      )}

      {view === "map" && !mapFailed ? (
        <div
          ref={containerRef}
          className="map-canvas"
          role="application"
          aria-label="Hotspot map"
        />
      ) : (
        <AreaList data={data} onOpen={openCell} />
      )}

      {data && (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          {data.dateRange.start} – {data.dateRange.end} · {data.timezone}
          {data.ruleVersion ? ` · rule ${data.ruleVersion}` : ""}
        </p>
      )}

      {selected && (
        <CellSheet summary={selected} onClose={() => setSelected(null)} window={windowDays} />
      )}
    </div>
  );
}

function AreaList({
  data,
  onOpen,
}: {
  data: Hotspots | null;
  onOpen: (cell: string) => void;
}) {
  const t = useTranslations("map");
  const tl = useTranslations("labels");
  if (!data) return <p>{t("loading")}</p>;
  if (data.cells.length === 0) return <p>{t("empty")}</p>;
  const sorted = [...data.cells].sort((a, b) => b.count - a.count);
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {sorted.map((c) => (
        <li key={c.cellId} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
          <button className="btn secondary" type="button" onClick={() => onOpen(c.cellId)}>
            {t("reports", { count: c.count })}
            {c.band ? ` · ${tl(`band.${c.band}`)}` : ""} ·{" "}
            {t("cellLabel", { cell: c.cellId.slice(0, 8) })}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CellSheet({
  summary,
  onClose,
  window: windowDays,
}: {
  summary: AreaSummary;
  onClose: () => void;
  window: 7 | 30;
}) {
  const t = useTranslations("map");
  const tl = useTranslations("labels");
  return (
    <div className="sheet">
      <div className="sheet-inner">
        <button className="btn secondary" type="button" onClick={onClose} style={{ float: "right" }}>
          {t("close")}
        </button>
        <h3>{t("reports", { count: summary.count })}</h3>
        {summary.band && (
          <p>{t("weeklyThresholds", { band: tl(`band.${summary.band}`) })}</p>
        )}
        {(summary.weaponCount > 0 || summary.injuryCount > 0) && (
          <p className="notice warn">
            {t("weaponInjury", {
              weapon: summary.weaponCount,
              injury: summary.injuryCount,
            })}
          </p>
        )}
        {summary.timeBreakdown ? (
          <p style={{ fontSize: "0.9rem" }}>
            {Object.entries(summary.timeBreakdown)
              .map(([k, v]) => `${tl(`timeBand.${k}`)}: ${v}`)
              .join(" · ")}
          </p>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {t("timeHidden")}
          </p>
        )}
        <p>
          <a className="btn" href={`area/${summary.cellId}?window=${windowDays}`}>
            {t("openArea")}
          </a>
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{t("approxNote")}</p>
      </div>
    </div>
  );
}
