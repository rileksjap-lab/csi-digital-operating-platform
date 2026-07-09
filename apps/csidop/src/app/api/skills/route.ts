import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { listSkills, createSkill } from "@/lib/repositories/skills.repo";
import { skillListQuerySchema, skillCreateSchema } from "@/lib/validations/skills.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = skillListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const skills = await listSkills(parsed.data.domain);
    return ok(skills);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager");

    const body = await request.json();
    const parsed = skillCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const skill = await createSkill(parsed.data, session);
    return ok(skill);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
