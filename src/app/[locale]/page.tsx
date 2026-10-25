import { getTranslations } from "next-intl/server";

// Home: map + legend placeholder. The real MapLibre map and the /hotspots
// data layer arrive in Stage 3; this is the Stage 1 shell with the legend and
// the non-negotiable "not a risk map" disclaimer in place.
export default async function HomePage() {
  const t = await getTranslations("home");
  const legend = await getTranslations("legend");

  const bands = [
    { key: "grey", color: "var(--band-grey)" },
    { key: "yellow", color: "var(--band-yellow)" },
    { key: "amber", color: "var(--band-amber)" },
    { key: "red", color: "var(--band-red)" },
  ] as const;

  return (
    <section>
      <h1>{t("title")}</h1>
      <p>{t("subtitle")}</p>

      <div className="notice warn">{t("disclaimer")}</div>

      <div className="map-placeholder" role="img" aria-label={t("mapView")}>
        {t("mapView")} — MapLibre + H3 layer (Stage 3)
      </div>

      <h2>{legend("title")}</h2>
      <div className="legend">
        {bands.map((b) => (
          <div className="row" key={b.key}>
            <span className="swatch" style={{ background: b.color }} />
            <span>{legend(b.key)}</span>
          </div>
        ))}
        <div className="row">
          <span
            className="swatch"
            style={{ background: "transparent", borderStyle: "dashed" }}
          />
          <span>{legend("weaponBadge")}</span>
        </div>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        {legend("note")}
      </p>
    </section>
  );
}
