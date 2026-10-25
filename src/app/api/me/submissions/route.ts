import { requireAccount } from "@/server/services/auth";
import { listOwnerSubmissions } from "@/server/services/submissions";
import { json, handleError } from "@/server/http";

export async function GET() {
  try {
    const account = await requireAccount();
    const rows = await listOwnerSubmissions(account.id);
    // Owner-only view of their own private submissions.
    return json({
      submissions: rows.map((r) => ({
        id: r.id,
        category: r.category,
        status: r.status,
        occurrenceDate: r.occurrenceLocalDate,
        broadArea: r.broadArea,
        createdAt: r.createdAt,
        canonicalIncidentId: r.canonicalIncidentId,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
