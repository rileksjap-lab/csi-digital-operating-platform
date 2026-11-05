import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, notFound, zodError, internalError } from "@/lib/response";
import { cmpIssuePatchSchema } from "@/lib/validations/cmp.schema";
import { getIssueById, updateIssue } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const issue = await getIssueById(id);
    if (!issue) return notFound("Issue not found");
    return ok(issue);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/issues/:id] GET error", err);
    return internalError(reqId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "close_issues", "record_decisions");

    const { id } = await params;
    const body = await request.json();
    const parsed = cmpIssuePatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const issue = await updateIssue(id, parsed.data, session);
    return ok(issue);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/issues/:id] PATCH error", err);
    return internalError(reqId);
  }
}
