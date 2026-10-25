import { ImageResponse } from "next/og";
import { getAreaSummary } from "@/server/services/publicRead";
import { bandLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Text-only share card for an area summary over the weekly window.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cell: string }> },
) {
  const { cell } = await params;
  const summary = await getAreaSummary(cell, 7);

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
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700 }}>
            {`${summary.count} published report${summary.count === 1 ? "" : "s"}`}
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#c7ccd1" }}>
            {`${summary.dateRange.start} – ${summary.dateRange.end}`}
          </div>
          {summary.band ? (
            <div style={{ display: "flex", fontSize: 28, color: "#9aa3ad" }}>
              {`${bandLabel[summary.band]} (weekly thresholds)`}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#9aa3ad" }}>
          Community reports are incomplete and do not measure personal risk
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
