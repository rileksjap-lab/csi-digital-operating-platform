import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { buildScopeWhere, canViewPerson } from "@/lib/auth/wo-scope";
import { ok, notFound, forbidden, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODS = new Set(["3", "6", "12"]);
const DONE = new Set(["Closed", "Cancelled"]);

interface WoRow {
  id: string; csiWoNo: string; title: string; typeName: string; priority: string; status: string;
  dueDate: string | null; createdAt: string; updatedAt: string | null; assignedToId: string | null;
  assignedToName: string | null; progress: number; myHours: number; totalHours: number;
  isAssignee: boolean; isTaskOwner: boolean; hasEffort: boolean;
}

interface TaskRow {
  woId: string; id: string; taskNo: number; description: string; ownerId: string | null; ownerName: string | null;
  progress: number; plannedEnd: string | null; dateCompleted: string | null;
}

/** One person's work: what is on their plate now, what they finished (history), and their effort log. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const { id } = await params;
    if (!UUID.test(id)) return notFound("Person not found");

    const person = await query<{ id: string; name: string; subTeam: string | null; deptId: string; roleName: string }>(
      `SELECT s.id, s.name, s.subteam AS "subTeam", s.deptid AS "deptId", r.rolename AS "roleName"
       FROM staff s JOIN role r ON r.id = s.roleid WHERE s.id = $1`,
      [id]
    );
    const p = person.rows[0];
    if (!p) return notFound("Person not found");
    if (!canViewPerson(scope, p)) return forbidden("You cannot view this person's work");

    // History window in months; "all" means no limit.
    const periodParam = request.nextUrl.searchParams.get("period") ?? "12";
    const months = PERIODS.has(periodParam) ? Number(periodParam) : null;

    const { clause: scopeClause, params: scopeParams } = buildScopeWhere(scope, 3);
    const baseParams = [id, months, ...scopeParams];

    const wos = await query<WoRow>(
      `SELECT w.id, w.csi_wo_no AS "csiWoNo", w.title, rt.typename AS "typeName",
              w.priorityinterdepart AS "priority", w.status, w.duedate::text AS "dueDate",
              w.createdat AS "createdAt", w.updatedat AS "updatedAt",
              w.assignedto AS "assignedToId", a.name AS "assignedToName",
              COALESCE((SELECT ROUND(AVG(wt.progress)) FROM wo_task wt WHERE wt.csi_wo_id = w.id AND wt.status = 'Active'), 0)::int AS "progress",
              COALESCE((SELECT SUM(e.hours) FROM effort_log e WHERE e.csi_wo_id = w.id AND e.staffid = $1), 0)::float AS "myHours",
              COALESCE((SELECT SUM(e.hours) FROM effort_log e WHERE e.csi_wo_id = w.id), 0)::float AS "totalHours",
              (w.assignedto = $1) AS "isAssignee",
              EXISTS (SELECT 1 FROM wo_task t WHERE t.csi_wo_id = w.id AND t.assignedto = $1 AND t.status = 'Active') AS "isTaskOwner",
              EXISTS (SELECT 1 FROM effort_log e WHERE e.csi_wo_id = w.id AND e.staffid = $1) AS "hasEffort"
       FROM csi_wo w
       JOIN request_type rt ON rt.id = w.requesttypeid
       LEFT JOIN staff a ON a.id = w.assignedto
       WHERE (w.assignedto = $1
              OR EXISTS (SELECT 1 FROM wo_task t WHERE t.csi_wo_id = w.id AND t.assignedto = $1 AND t.status = 'Active')
              OR EXISTS (SELECT 1 FROM effort_log e WHERE e.csi_wo_id = w.id AND e.staffid = $1))
         AND (w.status NOT IN ('Closed','Cancelled')
              OR $2::int IS NULL
              OR COALESCE(w.updatedat, w.createdat) >= now() - make_interval(months => $2::int))
         ${scopeClause}
       ORDER BY w.duedate ASC NULLS LAST, w.createdat DESC
       LIMIT 400`,
      baseParams
    );

    const ids = wos.rows.map((r) => r.id);
    const tasks = ids.length
      ? await query<TaskRow>(
          `SELECT t.csi_wo_id AS "woId", t.id, t.taskno AS "taskNo", t.description,
                  t.assignedto AS "ownerId", s.name AS "ownerName", t.progress,
                  t.plannedend::text AS "plannedEnd", t.datecompleted::text AS "dateCompleted"
           FROM wo_task t LEFT JOIN staff s ON s.id = t.assignedto
           WHERE t.csi_wo_id = ANY($1::uuid[]) AND t.status = 'Active'
           ORDER BY t.taskno`,
          [ids]
        )
      : { rows: [] as TaskRow[] };
    const tasksByWo = new Map<string, TaskRow[]>();
    for (const t of tasks.rows) tasksByWo.set(t.woId, [...(tasksByWo.get(t.woId) ?? []), t]);

    const effort = await query<{ logDate: string; hours: number; notes: string | null; woId: string; csiWoNo: string; title: string }>(
      `SELECT e.logdate::text AS "logDate", e.hours::float AS "hours", e.notes AS "notes",
              w.id AS "woId", w.csi_wo_no AS "csiWoNo", w.title
       FROM effort_log e JOIN csi_wo w ON w.id = e.csi_wo_id
       WHERE e.staffid = $1
         AND ($2::int IS NULL OR e.logdate >= (now() - make_interval(months => $2::int))::date)
         ${scopeClause}
       ORDER BY e.logdate DESC, e.createdat DESC
       LIMIT 100`,
      baseParams
    );

    const shape = (r: WoRow) => ({
      id: r.id, csiWoNo: r.csiWoNo, title: r.title, typeName: r.typeName, priority: r.priority, status: r.status,
      dueDate: r.dueDate, createdAt: r.createdAt, closedAt: DONE.has(r.status) ? r.updatedAt : null,
      assignedToName: r.assignedToName, progress: Number(r.progress),
      myHours: Number(r.myHours), totalHours: Number(r.totalHours),
      // Why this work order is on the person's list.
      involvement: [r.isAssignee ? "Assignee" : null, r.isTaskOwner ? "Task owner" : null, !r.isAssignee && !r.isTaskOwner && r.hasEffort ? "Logged effort" : null].filter(Boolean) as string[],
      tasks: (tasksByWo.get(r.id) ?? []).map((t) => ({
        id: t.id, taskNo: t.taskNo, description: t.description, ownerName: t.ownerName,
        isMine: t.ownerId === id, progress: Number(t.progress), plannedEnd: t.plannedEnd, dateCompleted: t.dateCompleted,
      })),
    });

    const current = wos.rows.filter((r) => !DONE.has(r.status)).map(shape);
    const history = wos.rows.filter((r) => DONE.has(r.status)).map(shape)
      .sort((x, y) => String(y.closedAt ?? "").localeCompare(String(x.closedAt ?? "")));

    // Summary figures. "Mine" = assigned to this person, so the same definitions as the main page apply.
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const mineCurrent = current.filter((w) => w.involvement.includes("Assignee"));
    const mineClosed = history.filter((w) => w.status === "Closed" && w.closedAt && w.involvement.includes("Assignee"));
    const onTime = mineClosed.filter((w) => !w.dueDate || String(w.closedAt ?? "").slice(0, 10) <= w.dueDate).length;
    const days = mineClosed.map((w) => (new Date(String(w.closedAt)).getTime() - new Date(w.createdAt).getTime()) / 86400000);

    return ok({
      person: { id: p.id, name: p.name, subTeam: p.subTeam, roleName: p.roleName },
      period: months === null ? "all" : String(months),
      summary: {
        active: mineCurrent.length,
        overdue: mineCurrent.filter((w) => (w.status === "Open" || w.status === "InProgress") && w.dueDate && w.dueDate < today).length,
        dueThisWeek: mineCurrent.filter((w) => w.dueDate && w.dueDate >= today && w.dueDate <= weekEnd).length,
        closed: mineClosed.length,
        onTimePct: mineClosed.length ? Math.round((100 * onTime) / mineClosed.length) : null,
        avgDays: days.length ? Math.round((10 * days.reduce((a, b) => a + b, 0)) / days.length) / 10 : null,
        effortHours: Math.round(10 * effort.rows.reduce((a, e) => a + Number(e.hours), 0)) / 10,
      },
      current,
      history,
      effort: effort.rows.map((e) => ({ ...e, hours: Number(e.hours) })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/progress/staff] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
