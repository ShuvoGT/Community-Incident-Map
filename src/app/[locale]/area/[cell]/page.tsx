import type { Metadata } from "next";
import { getAreaSummary } from "@/server/services/publicRead";
import { env } from "@/server/env";
import { categoryLabel, timeBandLabel, bandLabel } from "@/lib/labels";
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
  const title = `Area reporting summary (${summary.dateRange.start}–${summary.dateRange.end})`;
  const description = `${summary.count} published report(s) this week.${
    summary.band ? ` ${bandLabel[summary.band]} under the weekly thresholds.` : ""
  } Reports are incomplete and do not measure personal risk.`;

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

  return (
    <section>
      <h1>Area reporting summary</h1>
      <p style={{ color: "var(--muted)" }}>
        {summary.dateRange.start} – {summary.dateRange.end} · {summary.timezone} ·
        cell {cell}
      </p>

      <div className="notice warn">
        {summary.count} published report{summary.count === 1 ? "" : "s"} this week.{" "}
        {summary.band ? `${bandLabel[summary.band]} under the weekly thresholds. ` : ""}
        An area summary reflects reporting activity, not personal risk; reporting
        is incomplete.
      </div>

      {(summary.weaponCount > 0 || summary.injuryCount > 0) && (
        <p>
          {summary.weaponCount} with a reported weapon · {summary.injuryCount} with
          a reported injury.
        </p>
      )}

      {summary.timeBreakdown ? (
        <>
          <h2>Time pattern</h2>
          <ul>
            {Object.entries(summary.timeBreakdown).map(([k, v]) => (
              <li key={k}>
                {timeBandLabel[k] ?? k}: {v}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ color: "var(--muted)" }}>
          Time breakdown is hidden for cells with fewer than five reports.
        </p>
      )}

      <h2>Reports in this area</h2>
      {summary.incidents.length === 0 ? (
        <p>No published reports in this period.</p>
      ) : (
        <ul>
          {summary.incidents.map((i) => (
            <li key={i.publicId}>
              <Link href={`/incident/${i.publicId}`}>
                {categoryLabel[i.category] ?? i.category} · {i.occurrenceDate}
              </Link>
              {i.weaponFlag ? " · ⚠ weapon" : ""}
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16 }}>
        <ShareButton
          url={`/${locale}/area/${cell}`}
          title="Area reporting summary"
          text={`${summary.count} published report(s) this week in this Dhaka area.`}
          cardUrl={`/api/og/area/${cell}`}
        />
      </div>
    </section>
  );
}
