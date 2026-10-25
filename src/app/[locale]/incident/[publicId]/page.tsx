import type { Metadata } from "next";
import { getPublicIncident } from "@/server/services/publicRead";
import { env } from "@/server/env";
import { categoryLabel, timeBandLabel, reviewLabelText } from "@/lib/labels";
import { ShareButton } from "@/components/ShareButton";
import { ConcernForm } from "@/components/ConcernForm";

// Server-generated social preview metadata for the approved public page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}): Promise<Metadata> {
  const { locale, publicId } = await params;
  const incident = await getPublicIncident(publicId);
  const base = env.appBaseUrl;
  const canonical = `${base}/${locale}/incident/${publicId}`;

  if (!incident) {
    return { title: "Report unavailable", robots: { index: false } };
  }

  const title = `Community report near ${incident.broadArea ?? "Dhaka"}`;
  const description = `${categoryLabel[incident.category] ?? incident.category} reported on ${incident.occurrenceDate}. ${reviewLabelText[incident.reviewLabel]}.`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      images: [`${base}/api/og/incident/${publicId}`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${base}/api/og/incident/${publicId}`],
    },
  };
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ locale: string; publicId: string }>;
}) {
  const { locale, publicId } = await params;
  const incident = await getPublicIncident(publicId);

  if (!incident) {
    return (
      <section>
        <h1>Report unavailable</h1>
        <p>This report is not currently available.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>{categoryLabel[incident.category] ?? incident.category}</h1>
      <p style={{ color: "var(--muted)" }}>
        {incident.broadArea ?? "Dhaka"} · {incident.occurrenceDate} ·{" "}
        {timeBandLabel[incident.timeBand]}
      </p>

      {(incident.weaponFlag || incident.injuryFlag) && (
        <div className="notice warn">
          {incident.weaponFlag ? "Weapon reported. " : ""}
          {incident.injuryFlag ? "Injury reported." : ""}
        </div>
      )}

      <p>{incident.redactedNarrative}</p>

      <div className="notice">
        <strong>{reviewLabelText[incident.reviewLabel]}</strong>
        <br />
        Approximate area, not an exact incident point. Community reports are
        incomplete and do not measure personal risk.
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <ShareButton
          url={`/${locale}/incident/${publicId}`}
          title={`Community report near ${incident.broadArea ?? "Dhaka"}`}
          text={`${categoryLabel[incident.category]} reported on ${incident.occurrenceDate}.`}
          cardUrl={`/api/og/incident/${publicId}`}
        />
        <ConcernForm publicId={publicId} />
      </div>

      <p style={{ color: "var(--muted)" }}>
        Report ID: <code>{incident.publicId}</code>
      </p>
    </section>
  );
}
