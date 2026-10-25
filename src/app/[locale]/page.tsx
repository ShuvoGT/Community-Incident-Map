import { getTranslations } from "next-intl/server";
import { HotspotMap } from "@/components/HotspotMap";

// Home: the live hotspot map + filters (with an accessible list fallback) and
// the weekly legend, under the non-negotiable "not a risk map" disclaimer.
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

      <HotspotMap />

      <h2>{legend("title")}</h2>
      <div className="legend">
        {bands.map((b) => (
          <div className="row" key={b.key}>
            <span className="swatch" style={{ background: b.color }} />
            <span>{legend(b.key)}</span>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{legend("note")}</p>
    </section>
  );
}
