import { requireStaff } from "@/server/services/auth";
import { beginEnrollment } from "@/server/services/mfa";
import { json, handleError } from "@/server/http";

// Start TOTP enrollment for the signed-in staff member. The secret is stored
// only after a code is proven via /api/admin/mfa/enable.
export async function POST() {
  try {
    const account = await requireStaff();
    const { secret, otpauthUrl } = beginEnrollment(`staff-${account.id.slice(0, 8)}`);
    return json({ secret, otpauthUrl });
  } catch (e) {
    return handleError(e);
  }
}
