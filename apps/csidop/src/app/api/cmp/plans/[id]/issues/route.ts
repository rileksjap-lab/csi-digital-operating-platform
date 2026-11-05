import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, created, notFound, zodError, internalError } from "@/lib/response";
import { cmpIssueCreateSchema } from "@/lib/validations/cmp.schema";
import { getPlanById, listIssues, createIssue } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return notFound("Plan not found");
    const issues = await listIssues(id);
    return ok(issues);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/issues] GET error", err);
    return internalError(reqId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(
      session,
      "update_progress",
      "update_item_progress",
      "manage_workstream_items",
      "manage_hierarchy",
      "record_decisions"
    );

    const { id } = await params;
    const body = await request.json();
    const parsed = cmpIssueCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const issue = await createIssue(id, parsed.data, session);
    return created(issue);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/issues] POST error", err);
    return internalError(reqId);
  }
}
