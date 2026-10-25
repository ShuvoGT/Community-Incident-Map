import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPublicIncident } from "@/server/services/publicRead";
import { env } from "@/server/env";
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
  const l = await getTranslations({ locale, namespace: "labels" });

  if (!incident) {
    return { title: "Report unavailable", robots: { index: false } };
  }

  const title = `Community report near ${incident.broadArea ?? "Dhaka"}`;
  const description = `${l(`category.${incident.category}`)} reported on ${incident.occurrenceDate}. ${l(`reviewLabel.${incident.reviewLabel}`)}.`;

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
  const t = await getTranslations("incident");
  const l = await getTranslations("labels");

  if (!incident) {
    return (
      <section>
        <h1>{t("unavailableTitle")}</h1>
        <p>{t("unavailableBody")}</p>
      </section>
    );
  }

  return (
    <section>
      <h1>{l(`category.${incident.category}`)}</h1>
      <p style={{ color: "var(--muted)" }}>
        {incident.broadArea ?? "Dhaka"} · {incident.occurrenceDate} ·{" "}
        {l(`timeBand.${incident.timeBand}`)}
      </p>

      {(incident.weaponFlag || incident.injuryFlag) && (
        <div className="notice warn">
          {incident.weaponFlag ? `${t("weaponReported")} ` : ""}
          {incident.injuryFlag ? t("injuryReported") : ""}
        </div>
      )}

      <p>{incident.redactedNarrative}</p>

      <div className="notice">
        <strong>{l(`reviewLabel.${incident.reviewLabel}`)}</strong>
        <br />
        {t("approxNote")}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <ShareButton
          url={`/${locale}/incident/${publicId}`}
          title={`Community report near ${incident.broadArea ?? "Dhaka"}`}
          text={`${l(`category.${incident.category}`)} · ${incident.occurrenceDate}.`}
          cardUrl={`/api/og/incident/${publicId}`}
        />
        <ConcernForm publicId={publicId} />
      </div>

      <p style={{ color: "var(--muted)" }}>
        {t("reportId")} <code>{incident.publicId}</code>
      </p>
    </section>
  );
}
