import { ImageResponse } from "next/og";
import { getPublicIncident } from "@/server/services/publicRead";
import { categoryLabel, reviewLabelText } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Server-generated, text-only share card for an approved incident. No map
// tiles (avoids licensing), no identifying evidence or unreviewed narrative.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await params;
  const incident = await getPublicIncident(publicId);

  const title = incident
    ? categoryLabel[incident.category] ?? incident.category
    : "Report unavailable";
  const area = incident?.broadArea ?? "Dhaka";
  const date = incident?.occurrenceDate ?? "";
  const status = incident ? reviewLabelText[incident.reviewLabel] : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#15181c",
          color: "#e8ebee",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#9aa3ad" }}>
          Dhaka Community Incident Map
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 60, fontWeight: 700 }}>
            {title}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#c7ccd1" }}>
            {`${area}${date ? ` · ${date}` : ""}`}
          </div>
          {incident ? (
            <div style={{ display: "flex", fontSize: 26, color: "#9aa3ad" }}>
              {status}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#9aa3ad" }}>
          Approximate area, not an exact point · Reports are incomplete and do
          not measure personal risk
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
