import { getWeeklyStats } from "@/server/services/publicRead";
import { json, handleError } from "@/server/http";

export async function GET() {
  try {
    return json(await getWeeklyStats());
  } catch (e) {
    return handleError(e);
  }
}
