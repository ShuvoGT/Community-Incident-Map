import { z } from "zod";
import { requireAccount } from "@/server/services/auth";
import { getOwnerSubmission } from "@/server/services/submissions";
import {
  createEvidenceUpload,
  InvalidEvidenceError,
} from "@/server/services/evidence";
import { json, error, handleError } from "@/server/http";

const schema = z.object({
  submissionId: z.string().uuid(),
  fileType: z.string(),
  size: z.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const account = await requireAccount();
    const { submissionId, fileType, size } = schema.parse(await req.json());

    // Only the submission's owner may attach evidence to it.
    const owned = await getOwnerSubmission(account.id, submissionId);
    if (!owned) return error("Not found", 404);

    const result = await createEvidenceUpload(submissionId, fileType, size);
    return json(result, 201);
  } catch (e) {
    if (e instanceof InvalidEvidenceError) return error(e.message, 422);
    return handleError(e);
  }
}
