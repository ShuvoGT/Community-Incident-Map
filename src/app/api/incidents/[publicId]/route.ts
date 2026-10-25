import { getPublicIncident } from "@/server/services/publicRead";
import { json, error, handleError } from "@/server/http";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;
    const incident = await getPublicIncident(publicId);
    if (!incident) {
      // Neutral unavailable — never repeat an allegation for a
      // withdrawn/hidden/unknown record.
      return error("This report is not available", 404);
    }
    return json({ incident });
  } catch (e) {
    return handleError(e);
  }
}
