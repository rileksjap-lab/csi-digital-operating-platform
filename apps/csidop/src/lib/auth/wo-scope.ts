import type { ScopeFilter } from "@/lib/auth/guards";

/** SQL fragment limiting csi_wo rows (alias w) to what the caller's role scope may see. */
export function buildScopeWhere(scope: ScopeFilter, paramOffset: number): { clause: string; params: unknown[] } {
  switch (scope.scope) {
    case "Self":
      return {
        clause: `AND (w.assignedto = $${paramOffset} OR w.createdby = $${paramOffset})`,
        params: [scope.staffId],
      };
    case "Pod":
      return {
        clause: `AND (w.assignedto IN (SELECT s2.id FROM staff s2 WHERE s2.deptid = $${paramOffset} AND s2.subteam = $${paramOffset + 1}) OR w.createdby = $${paramOffset + 2})`,
        params: [scope.departmentId, scope.subTeam, scope.staffId],
      };
    default:
      return { clause: "", params: [] };
  }
}

/** Whether the caller's scope allows looking at one person's workload. */
export function canViewPerson(
  scope: ScopeFilter,
  person: { id: string; deptId: string; subTeam: string | null }
): boolean {
  if (person.id === scope.staffId) return true;
  switch (scope.scope) {
    case "Self":
      return false;
    case "Pod":
      return person.deptId === scope.departmentId && person.subTeam === scope.subTeam;
    default:
      return person.deptId === scope.departmentId;
  }
}
