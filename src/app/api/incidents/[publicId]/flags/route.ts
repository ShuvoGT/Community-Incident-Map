import { z } from "zod";
import { recordConcern } from "@/server/services/flags";
import { json, handleError } from "@/server/http";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;
    const { reason } = schema.parse(await req.json());
    await recordConcern(publicId, reason);
    // Neutral response — never disclose whether a report exists or who flagged.
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
