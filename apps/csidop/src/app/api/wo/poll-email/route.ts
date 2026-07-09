import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { pollForWoEmails } from "@/lib/email/wo-poller";

// Manual trigger — HOD/admin only
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD");

    const created = await pollForWoEmails();
    return ok({ created, message: `Imported ${created} new WO(s) from email` });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/poll-email] POST error", err);
    return internalError("poll-email-failed");
  }
}
