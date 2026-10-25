import { requireAdmin } from "@/server/services/auth";
import { buildAggregateCsv } from "@/server/services/export";
import { handleError } from "@/server/http";

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("window") ?? "7") === 30 ? 30 : 7;
    const { filename, csv } = await buildAggregateCsv(admin.id, days);

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
