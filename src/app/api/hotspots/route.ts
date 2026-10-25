import { getHotspots } from "@/server/services/publicRead";
import { json, handleError } from "@/server/http";

export async function GET() {
  try {
    const data = await getHotspots();
    return json(data);
  } catch (e) {
    return handleError(e);
  }
}
