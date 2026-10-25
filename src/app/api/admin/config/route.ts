import { z } from "zod";
import { requireAdmin } from "@/server/services/auth";
import { getConfig, updateConfig } from "@/server/services/config";
import { json, handleError } from "@/server/http";

export async function GET() {
  try {
    await requireAdmin();
    const cfg = await getConfig();
    return json({ config: cfg });
  } catch (e) {
    return handleError(e);
  }
}

const num = z.number().int().nonnegative();
const schema = z.object({
  rateLimits: z
    .object({
      submissionsPerContactPerDay: num,
      otpPerContactPerHour: num,
      ipPerMinute: num,
    })
    .partial()
    .optional(),
  retentionPolicy: z
    .object({
      rejectedAbandonedDays: num,
      evidenceNarrativeDays: num,
      publicIncidentMonths: num,
      inactiveAccountMonths: num,
      auditLogDays: num,
    })
    .partial()
    .optional(),
  ruleVersion: z.string().trim().min(1).max(40).optional(),
});

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin();
    const patch = schema.parse(await req.json());
    const updated = await updateConfig(admin.id, patch);
    return json({ config: updated });
  } catch (e) {
    return handleError(e);
  }
}
