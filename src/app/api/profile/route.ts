import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);

    const [staffRes, skillsRes, certsRes, effortRes] = await Promise.all([
      query(
        `SELECT s.id, s.staffcode, s.name, s.email, s.subteam,
                s.productivityfactor, s.dailyusablehours, s.status,
                r.rolecode, r.rolename, d.deptcode, d.deptname,
                s.createdat
         FROM staff s
         JOIN role r ON r.id = s.roleid
         JOIN department d ON d.id = s.deptid
         WHERE s.id = $1`,
        [session.staffId]
      ),
      query(
        `SELECT sk.skillname, sk.technologydomain, ss.competencylevel, ss.lastassessmentdate
         FROM staff_skill ss
         JOIN skill sk ON sk.id = ss.skillid
         WHERE ss.staffid = $1
         ORDER BY sk.technologydomain, sk.skillname`,
        [session.staffId]
      ),
      query(
        `SELECT c.certificationname, c.vendor, c.certificationlevel, c.issuedate, c.expirydate, c.status
         FROM certification c
         WHERE c.staffid = $1
         ORDER BY c.expirydate DESC NULLS LAST`,
        [session.staffId]
      ),
      query<{ totalHours: string; totalEntries: string }>(
        `SELECT COALESCE(SUM(hours), 0)::text AS "totalHours",
                COUNT(*)::text AS "totalEntries"
         FROM effort_log
         WHERE staffid = $1`,
        [session.staffId]
      ),
    ]);

    const staff = staffRes.rows[0];
    if (!staff) return ok(null);

    return ok({
      id: staff.id,
      staffCode: staff.staffcode,
      name: staff.name,
      email: staff.email,
      roleCode: staff.rolecode,
      roleName: staff.rolename,
      deptCode: staff.deptcode,
      deptName: staff.deptname,
      subTeam: staff.subteam,
      productivityFactor: parseFloat(String(staff.productivityfactor)),
      dailyUsableHours: parseFloat(String(staff.dailyusablehours)),
      status: staff.status,
      createdAt: String(staff.createdat),
      skills: skillsRes.rows.map((r) => ({
        skillName: r.skillname,
        domain: r.technologydomain,
        competencyLevel: r.competencylevel,
        lastAssessmentDate: String(r.lastassessmentdate),
      })),
      certifications: certsRes.rows.map((r) => ({
        certificationName: r.certificationname,
        issuingBody: r.vendor ?? null,
        certificationLevel: r.certificationlevel ?? null,
        issueDate: r.issuedate ? String(r.issuedate) : null,
        expiryDate: r.expirydate ? String(r.expirydate) : null,
        status: r.status,
      })),
      effortSummary: {
        totalHours: parseFloat(effortRes.rows[0]?.totalHours ?? "0"),
        totalEntries: parseInt(effortRes.rows[0]?.totalEntries ?? "0", 10),
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[profile] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
