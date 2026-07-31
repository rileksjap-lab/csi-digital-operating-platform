import { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";

export type ActivityPeriod = "today" | "week" | "month";

export interface TeamActivityWo {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priority: string;
  progressPercent: number;
}

export interface TeamActivityRow {
  staffId: string;
  name: string;
  roleCode: string;
  subTeam: string | null;
  deptCode: string;
  status: string;
  hoursLoggedInPeriod: number;
  currentWos: TeamActivityWo[];
}

function periodRange(period: ActivityPeriod): { start: string; end: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (period === "today") {
    const today = iso(now);
    return { start: today, end: today };
  }

  if (period === "week") {
    const day = now.getDay(); // 0=Sun..6=Sat
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: iso(monday), end: iso(sunday) };
  }

  // month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: iso(monthStart), end: iso(monthEnd) };
}

export async function getTeamActivity(
  period: ActivityPeriod,
  scope: ScopeFilter
): Promise<TeamActivityRow[]> {
  const { start, end } = periodRange(period);

  const params: unknown[] = [start, end];
  const wheres: string[] = ["s.status IN ('Active', 'OnLeave')"];
  let pi = 3;

  if (scope.scope === "Self") {
    wheres.push(`s.id = $${pi}`);
    params.push(scope.staffId);
    pi++;
  } else if (scope.scope === "Pod") {
    wheres.push(`s.deptid = $${pi} AND s.subteam = $${pi + 1}`);
    params.push(scope.departmentId, scope.subTeam);
    pi += 2;
  }

  const staffResult = await query<{
    StaffId: string; Name: string; RoleCode: string; SubTeam: string | null;
    DeptCode: string; Status: string; HoursLogged: string;
  }>(
    `SELECT s.id AS "StaffId", s.name AS "Name", r.rolecode AS "RoleCode",
            s.subteam AS "SubTeam", d.deptcode AS "DeptCode", s.status AS "Status",
            COALESCE(worked.total, 0) AS "HoursLogged"
     FROM staff s
     JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     LEFT JOIN (
       SELECT staffid, SUM(hours) AS total
       FROM effort_log
       WHERE logdate >= $1::date AND logdate <= $2::date
       GROUP BY staffid
     ) worked ON worked.staffid = s.id
     WHERE ${wheres.join(" AND ")}
     ORDER BY s.name`,
    params
  );

  const staffIds = staffResult.rows.map((r) => r.StaffId);
  const woByStaff = new Map<string, TeamActivityWo[]>();

  if (staffIds.length > 0) {
    const woResult = await query<{
      StaffId: string; Id: string; CsiWoNo: string; Title: string;
      Status: string; Priority: string; ProgressPercent: string;
    }>(
      `SELECT w.assignedto AS "StaffId", w.id AS "Id", w.csi_wo_no AS "CsiWoNo",
              w.title AS "Title", w.status AS "Status", w.priorityinterdepart AS "Priority",
              COALESCE((SELECT ROUND(AVG(wt.progress)) FROM wo_task wt
                        WHERE wt.csi_wo_id = w.id AND wt.status = 'Active'), 0) AS "ProgressPercent"
       FROM csi_wo w
       WHERE w.assignedto = ANY($1::uuid[]) AND w.status IN ('Open', 'InProgress')
       ORDER BY w.duedate ASC NULLS LAST`,
      [staffIds]
    );
    for (const r of woResult.rows) {
      const list = woByStaff.get(r.StaffId) ?? [];
      list.push({
        id: r.Id, csiWoNo: r.CsiWoNo, title: r.Title, status: r.Status,
        priority: r.Priority, progressPercent: parseInt(r.ProgressPercent, 10),
      });
      woByStaff.set(r.StaffId, list);
    }
  }

  return staffResult.rows.map((r) => ({
    staffId: r.StaffId,
    name: r.Name,
    roleCode: r.RoleCode,
    subTeam: r.SubTeam,
    deptCode: r.DeptCode,
    status: r.Status,
    hoursLoggedInPeriod: parseFloat(r.HoursLogged),
    currentWos: woByStaff.get(r.StaffId) ?? [],
  }));
}
