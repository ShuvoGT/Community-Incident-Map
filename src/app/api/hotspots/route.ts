import { getHotspots, getFilteredHotspots } from "@/server/services/publicRead";
import { json, handleError } from "@/server/http";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const windowDays = Number(url.searchParams.get("window") ?? "7");
    const category = url.searchParams.get("category") ?? undefined;
    const timeBand = url.searchParams.get("timeBand") ?? undefined;

    // Default weekly layer uses the precomputed band aggregates; any filter
    // switches to the live, neutral-scale layer.
    if (windowDays === 7 && !category && !timeBand) {
      return json(await getHotspots());
    }
    return json(
      await getFilteredHotspots({
        days: windowDays === 30 ? 30 : 7,
        category,
        timeBand,
      }),
    );
  } catch (e) {
    return handleError(e);
  }
}
