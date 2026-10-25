import { getTranslations } from "next-intl/server";
import { getWeeklyStats, listPublicIncidents } from "@/server/services/publicRead";
import { HotspotMap } from "@/components/HotspotMap";
import { Link } from "@/i18n/navigation";

const CATEGORY_ORDER = [
  "snatching",
  "robbery_force",
  "pickpocketing",
  "other_theft",
  "attempted",
] as const;

// Dashboard home: headline KPIs, the live hotspot map, a category breakdown
// and recent reports — all under the non-negotiable "not a risk map"
// disclaimer.
export default async function HomePage() {
  const t = await getTranslations("home");
  const d = await getTranslations("dashboard");
  const legend = await getTranslations("legend");
  const l = await getTranslations("labels");

  const stats = await getWeeklyStats();
  const recent = await listPublicIncidents({
    from: stats.dateRange.start,
    to: stats.dateRange.end,
    limit: 6,
  });

  const bands = [
    { key: "grey", color: "var(--band-grey)" },
    { key: "yellow", color: "var(--band-yellow)" },
    { key: "amber", color: "var(--band-amber)" },
    { key: "red", color: "var(--band-red)" },
  ] as const;

  const maxCat = Math.max(1, ...Object.values(stats.byCategory));

  return (
    <section>
      <div className="hero">
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 6 }}>
          {d("window", {
            start: stats.dateRange.start,
            end: stats.dateRange.end,
            tz: stats.timezone,
          })}
        </p>
      </div>

      <div className="notice warn">{t("disclaimer")}</div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">{d("reportsThisWeek")}</div>
          <div className="value accent">{stats.total}</div>
          <div className="sub">{d("reportsSub")}</div>
        </div>
        <div className="kpi">
          <div className="label">{d("activeAreas")}</div>
          <div className="value">{stats.activeCells}</div>
          <div className="sub">{d("activeAreasSub")}</div>
        </div>
        <div className="kpi">
          <div className="label">{d("weapon")}</div>
          <div className="value">{stats.weaponCount}</div>
          <div className="sub">{d("withInjury", { count: stats.injuryCount })}</div>
        </div>
        <div className="kpi">
          <div className="label">{d("topArea")}</div>
          <div className="value">{stats.topArea?.count ?? 0}</div>
          <div className="sub">
            {stats.topArea ? l(`band.${stats.topArea.band}`) : legend("grey")}
          </div>
        </div>
      </div>

      <div className="card">
        <HotspotMap />
        <div className="legend">
          {bands.map((b) => (
            <span className="row" key={b.key}>
              <span className="swatch" style={{ background: b.color }} />
              {legend(b.key)}
            </span>
          ))}
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: "4px 0 0" }}>
          {legend("note")}
        </p>
      </div>

      <div className="section-grid">
        <div className="card">
          <h2>{d("byCategory")}</h2>
          <div className="bars">
            {CATEGORY_ORDER.map((c) => {
              const n = stats.byCategory[c] ?? 0;
              return (
                <div className="bar" key={c}>
                  <div className="bar-top">
                    <span>{l(`category.${c}`)}</span>
                    <span className="n">{n}</span>
                  </div>
                  <div className="track">
                    <div
                      className="fill"
                      style={{ width: `${(n / maxCat) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>{d("recent")}</h2>
          {recent.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>{d("noneYet")}</p>
          ) : (
            <ul className="rlist">
              {recent.map((i) => (
                <li key={i.publicId}>
                  <span>
                    <Link href={`/incident/${i.publicId}`}>
                      {l(`category.${i.category}`)}
                    </Link>
                    <br />
                    <span className="meta">
                      {i.broadArea ?? "Dhaka"} · {i.occurrenceDate}
                    </span>
                  </span>
                  {(i.weaponFlag || i.injuryFlag) && (
                    <span className="badge warn">{legend("weaponBadge")}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
