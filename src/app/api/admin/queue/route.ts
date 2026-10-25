import { requireStaff } from "@/server/services/auth";
import { listReviewQueue } from "@/server/services/moderation";
import { json, handleError } from "@/server/http";

export async function GET() {
  try {
    await requireStaff();
    const rows = await listReviewQueue();
    return json({
      queue: rows.map((r) => ({
        id: r.id,
        category: r.category,
        relationship: r.relationship,
        status: r.status,
        occurrenceDate: r.occurrenceLocalDate,
        broadArea: r.broadArea,
        weaponReported: r.weaponReported,
        injury: r.injury,
        createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
