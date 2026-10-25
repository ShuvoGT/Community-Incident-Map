import { getAreaSummary } from "@/server/services/publicRead";
import { json, handleError } from "@/server/http";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ cell: string }> },
) {
  try {
    const { cell } = await params;
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("window") ?? "7") === 30 ? 30 : 7;
    return json(await getAreaSummary(cell, days));
  } catch (e) {
    return handleError(e);
  }
}
