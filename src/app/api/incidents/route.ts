import { listPublicIncidents } from "@/server/services/publicRead";
import { json, handleError } from "@/server/http";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rows = await listPublicIncidents({
      category: url.searchParams.get("category") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? "100"),
    });
    return json({ incidents: rows });
  } catch (e) {
    return handleError(e);
  }
}
