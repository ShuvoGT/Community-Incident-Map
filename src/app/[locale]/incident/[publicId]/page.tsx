import { getPublicIncident } from "@/server/services/publicRead";

const categoryLabel: Record<string, string> = {
  robbery_force: "Robbery with force or threat",
  snatching: "Snatching",
  pickpocketing: "Pickpocketing",
  other_theft: "Other theft",
  attempted: "Attempted robbery or theft",
};

const timeBandLabel: Record<string, string> = {
  band_0_6: "Late night (00:00–05:59)",
  band_6_12: "Morning (06:00–11:59)",
  band_12_18: "Afternoon (12:00–17:59)",
  band_18_24: "Evening (18:00–23:59)",
  unknown: "Time unknown",
};

const reviewLabelText: Record<string, string> = {
  community_reviewed: "Community report reviewed — not independently confirmed",
  supporting_reviewed: "Supporting material reviewed",
  independently_corroborated: "Independently corroborated",
  disputed: "Disputed and under review",
};

// Public, approved detail page. Shows only safe fields; never contact,
// evidence, financial loss or a raw coordinate.
export default async function IncidentPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
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

      <p>
        Report ID: <code>{incident.publicId}</code>
      </p>
    </section>
  );
}
