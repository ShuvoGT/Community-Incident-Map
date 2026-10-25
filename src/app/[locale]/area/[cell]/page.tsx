import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getAreaSummary } from "@/server/services/publicRead";
import { env } from "@/server/env";
import { ShareButton } from "@/components/ShareButton";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; cell: string }>;
}): Promise<Metadata> {
  const { locale, cell } = await params;
  const summary = await getAreaSummary(cell, 7);
  const base = env.appBaseUrl;
  const canonical = `${base}/${locale}/area/${cell}`;
  const t = await getTranslations({ locale, namespace: "area" });
  const l = await getTranslations({ locale, namespace: "labels" });

  const title = t("title");
  const description = `${t("summary", { count: summary.count })} ${
    summary.band ? t("activitySuffix", { band: l(`band.${summary.band}`) }) : ""
  }`.trim();

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: [`${base}/api/og/area/${cell}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${base}/api/og/area/${cell}`],
    },
  };
}

export default async function AreaPage({
  params,
}: {
  params: Promise<{ locale: string; cell: string }>;
}) {
  const { locale, cell } = await params;
  const summary = await getAreaSummary(cell, 7);
  const t = await getTranslations("area");
  const l = await getTranslations("labels");

  return (
    <section>
      <h1>{t("title")}</h1>
      <p style={{ color: "var(--muted)" }}>
        {t("meta", {
          start: summary.dateRange.start,
          end: summary.dateRange.end,
          tz: summary.timezone,
          cell,
        })}
      </p>

      <div className="notice warn">
        {t("summary", { count: summary.count })}{" "}
        {summary.band
          ? `${t("activitySuffix", { band: l(`band.${summary.band}`) })} `
          : ""}
        {t("riskNote")}
      </div>

      {(summary.weaponCount > 0 || summary.injuryCount > 0) && (
        <p>
          {t("weaponInjury", {
            weapon: summary.weaponCount,
            injury: summary.injuryCount,
          })}
        </p>
      )}

      {summary.timeBreakdown ? (
        <>
          <h2>{t("timePattern")}</h2>
          <ul>
            {Object.entries(summary.timeBreakdown).map(([k, v]) => (
              <li key={k}>
                {l(`timeBand.${k}`)}: {v}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ color: "var(--muted)" }}>{t("timeHidden")}</p>
      )}

      <h2>{t("reportsHeading")}</h2>
      {summary.incidents.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul>
          {summary.incidents.map((i) => (
            <li key={i.publicId}>
              <Link href={`/incident/${i.publicId}`}>
                {l(`category.${i.category}`)} · {i.occurrenceDate}
              </Link>
              {i.weaponFlag ? " · ⚠" : ""}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16 }}>
        <ShareButton
          url={`/${locale}/area/${cell}`}
          title={t("shareTitle")}
          text={t("shareText", { count: summary.count })}
          cardUrl={`/api/og/area/${cell}`}
        />
      </div>
    </section>
  );
}
