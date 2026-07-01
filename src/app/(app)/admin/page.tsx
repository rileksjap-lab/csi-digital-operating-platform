"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";

// ─── Shared Types ──────────────────────────────────────────────────────────

interface RequestType {
  id: string; typeCode: number; typeName: string; domain: string;
  slaAckDays: number; slaClassifyDays: number; slaRouteDays: number;
}
interface ComplexityTier {
  id: string; tierCode: number; tierName: string;
  approverRoleId: string; approverRoleName: string;
}
interface MultiplierFactor {
  id: string; factorCode: string; multiplierValue: number;
}
interface RoleSplit {
  id: string; deptId: string; deptCode: string;
  roleId: string; roleCode: string; roleName: string; percentage: number;
}
interface SystemSetting {
  id: string; settingKey: string; settingValue: string; description: string | null;
}
interface StaffAdmin {
  id: string; staffCode: string; name: string; email: string;
  roleId: string; roleCode: string; roleName: string;
  deptId: string; deptCode: string; deptName: string;
  subTeam: string | null; productivityFactor: number;
  dailyUsableHours: number; status: string; systemConfigFlag: boolean;
}
interface BaselineTier {
  id: string; tierSize: string; baselineCSIHours: number; baselineCMTHours: number;
}
interface RoleRow {
  id: string; roleCode: string; roleName: string; capacityScope: string; staffCount: number;
}
interface DepartmentRow {
  id: string; deptCode: string; deptName: string; staffCount: number;
}
interface RolePermission {
  roleId: string; roleCode: string; roleName: string;
  moduleCode: string; accessLevel: string;
}
interface AuditEntry {
  id: string; entityName: string; entityId: string; action: string;
  fieldName: string | null; oldValue: string | null; newValue: string | null;
  reason: string | null; performedByName: string; performedAt: string;
}
interface LookupRole { Id: string; RoleCode?: string; RoleName?: string }
interface LookupOption { Id: string; DeptCode?: string; DeptName?: string; RoleCode?: string; RoleName?: string }
interface PendingStaff {
  id: string; staffCode: string; name: string; email: string;
  deptName: string; deptCode: string; status: string; createdAt: string;
}

type Section =
  | "pending-approvals" | "staff" | "roles" | "departments" | "permissions"
  | "request-types" | "task-templates" | "complexity-tiers" | "baseline-tiers" | "multiplier-factors"
  | "role-split" | "settings" | "audit-log";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "pending-approvals", label: "Pending Approvals", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "staff", label: "Staff Management", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { key: "roles", label: "Roles", icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" },
  { key: "departments", label: "Departments", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
  { key: "permissions", label: "Role Permissions", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
  { key: "request-types", label: "Request Types & SLA", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { key: "task-templates", label: "Task Templates", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { key: "complexity-tiers", label: "Complexity Tiers", icon: "M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" },
  { key: "baseline-tiers", label: "Baseline Tiers", icon: "M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16" },
  { key: "multiplier-factors", label: "Multiplier Factors", icon: "M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" },
  { key: "role-split", label: "Role Split %", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
  { key: "settings", label: "System Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
  { key: "audit-log", label: "Audit Log", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
];

const MODULES = [
  { code: "dashboard", label: "Dashboard" },
  { code: "work_orders", label: "Work Orders" },
  { code: "wo_inbox", label: "WO Inbox" },
  { code: "wo_progress", label: "WO Progress" },
  { code: "my_tasks", label: "My Tasks" },
  { code: "workloads", label: "Workloads" },
  { code: "capacity", label: "Capacity" },
  { code: "kpi", label: "KPI Dashboard" },
  { code: "skills", label: "Skills" },
  { code: "reports", label: "Reports" },
  { code: "admin", label: "Admin" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function Spinner() {
  return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>;
}
function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
}
function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}
function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [section, setSection] = useState<Section>("pending-approvals");

  const rc = user?.roleCode ?? "";
  const isAdmin = user?.systemConfigFlag || rc === "HOD" || rc === "SM";

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-800">Admin & Configuration</h1>
        <ErrorBox message="You do not have admin access. Contact your HOD or Solution Manager." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800">Admin & Configuration</h1>

      <div className="flex gap-6">
        <nav className="w-56 shrink-0 space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                section === s.key
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
              </svg>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          {section === "pending-approvals" && <PendingApprovalsPanel />}
          {section === "staff" && <StaffPanel />}
          {section === "roles" && <RolesPanel />}
          {section === "departments" && <DepartmentsPanel />}
          {section === "permissions" && <PermissionsPanel />}
          {section === "request-types" && <RequestTypesPanel />}
          {section === "task-templates" && <TaskTemplatesPanel />}
          {section === "complexity-tiers" && <ComplexityTiersPanel />}
          {section === "baseline-tiers" && <BaselineTiersPanel />}
          {section === "multiplier-factors" && <MultiplierFactorsPanel />}
          {section === "role-split" && <RoleSplitPanel />}
          {section === "settings" && <SettingsPanel />}
          {section === "audit-log" && <AuditLogPanel />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PANELS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Pending Approvals ────────────────────────────────────────────────────

function PendingApprovalsPanel() {
  const { data, error, isLoading, mutate } = useSWR<PendingStaff[]>("/api/admin/pending-staff", apiFetcher);
  const { data: lookups } = useSWR<{ roles: LookupRole[] }>("/api/lookups", apiFetcher);
  const [acting, setActing] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState("");

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load pending registrations" />;
  const rows = data ?? [];
  const pendingRows = rows.filter((r) => r.status === "PendingApproval");
  const rejectedRows = rows.filter((r) => r.status === "Rejected");
  const roles = lookups?.roles ?? [];

  async function handleAction(staffId: string, action: "approve" | "reject") {
    setActing(staffId); setActionError("");
    try {
      const body: Record<string, string> = { staffId, action };
      if (action === "approve" && selectedRole[staffId]) body.roleId = selectedRole[staffId];
      const res = await fetch("/api/admin/pending-staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.success) { setActionError(json.error?.message ?? "Action failed"); return; }
      mutate();
    } catch { setActionError("Network error"); } finally { setActing(null); }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="Pending Registrations" action={pendingRows.length > 0 ? <Badge className="bg-amber-100 text-amber-700">{pendingRows.length}</Badge> : undefined} />
        {actionError && <div className="mx-4 mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{actionError}</div>}
        {pendingRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No pending registrations</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingRows.map((r) => (
              <div key={r.id} className="px-4 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.name}</p>
                  <p className="text-sm text-gray-500">{r.email}</p>
                  <p className="text-xs text-gray-400 mt-1">Dept: {r.deptName} ({r.deptCode}) &middot; {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={selectedRole[r.id] ?? ""} onChange={(e) => setSelectedRole({ ...selectedRole, [r.id]: e.target.value })} className="rounded border border-gray-300 px-2 py-1.5 text-xs">
                    <option value="">Assign role...</option>
                    {roles.map((role: LookupRole) => <option key={role.Id} value={role.Id}>{role.RoleName}</option>)}
                  </select>
                  <button onClick={() => handleAction(r.id, "approve")} disabled={acting === r.id} className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">Approve</button>
                  <button onClick={() => handleAction(r.id, "reject")} disabled={acting === r.id} className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {rejectedRows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <SectionHeader title="Recently Rejected" />
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Email</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Dept</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rejectedRows.map((r) => (
                <tr key={r.id} className="text-gray-500">
                  <td className="px-4 py-2">{r.name}</td><td className="px-4 py-2">{r.email}</td>
                  <td className="px-4 py-2">{r.deptCode}</td><td className="px-4 py-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Roles ────────────────────────────────────────────────────────────────

function RolesPanel() {
  const { data, error, isLoading, mutate } = useSWR<RoleRow[]>("/api/admin/roles", apiFetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<RoleRow>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ roleCode: "", roleName: "", capacityScope: "Self" });
  const [addError, setAddError] = useState("");

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load roles" />;
  const rows = data ?? [];

  async function save(id: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...draft }) });
      setEditing(null); setDraft({}); mutate();
    } finally { setSaving(false); }
  }
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setAddError("");
    if (!addForm.roleCode || !addForm.roleName) { setAddError("Code and name are required"); return; }
    try {
      const res = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addForm) });
      const json = await res.json();
      if (!json.success) { setAddError(json.error?.message ?? "Failed"); return; }
      setShowAdd(false); setAddForm({ roleCode: "", roleName: "", capacityScope: "Self" }); mutate();
    } catch { setAddError("Network error"); }
  }
  async function handleDelete(id: string, code: string) {
    if (!confirm(`Delete role "${code}"? Only possible if no staff are assigned.`)) return;
    const res = await fetch("/api/admin/roles", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const json = await res.json();
    if (!json.success) alert(json.error?.message ?? "Cannot delete"); else mutate();
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Roles" description="Manage system roles and their scope levels" action={
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Role
        </button>
      } />
      {showAdd && (
        <form onSubmit={handleAdd} className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-end gap-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">Code</span><input value={addForm.roleCode} onChange={(e) => setAddForm({...addForm, roleCode: e.target.value})} className="mt-1 block w-24 rounded border border-gray-300 px-2 py-1 text-sm" placeholder="e.g. EXEC" /></label>
          <label className="block flex-1"><span className="text-xs font-medium text-gray-600">Name</span><input value={addForm.roleName} onChange={(e) => setAddForm({...addForm, roleName: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="e.g. Executive" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Scope</span>
            <select value={addForm.capacityScope} onChange={(e) => setAddForm({...addForm, capacityScope: e.target.value})} className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm">
              <option value="Self">Self</option><option value="Pod">Pod</option><option value="Stream">Stream</option><option value="Department">Department</option>
            </select>
          </label>
          <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700">Add</button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
          {addError && <span className="text-xs text-red-600">{addError}</span>}
        </form>
      )}
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50"><tr>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Code</th>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Scope</th>
          <th className="px-4 py-2 text-right font-medium text-gray-500">Staff</th>
          <th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-700 font-mono text-xs">{r.roleCode}</td>
              <td className="px-4 py-2">{editing === r.id ? <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" defaultValue={r.roleName} onChange={(e) => setDraft({...draft, roleName: e.target.value})} /> : <span className="text-gray-800">{r.roleName}</span>}</td>
              <td className="px-4 py-2">{editing === r.id ? (
                <select className="rounded border border-gray-300 px-2 py-1 text-sm" defaultValue={r.capacityScope} onChange={(e) => setDraft({...draft, capacityScope: e.target.value})}>
                  <option value="Self">Self</option><option value="Pod">Pod</option><option value="Stream">Stream</option><option value="Department">Department</option>
                </select>
              ) : <span className="text-gray-600">{r.capacityScope}</span>}</td>
              <td className="px-4 py-2 text-right text-gray-600">{r.staffCount}</td>
              <td className="px-4 py-2 text-right">
                {editing === r.id ? (
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => save(r.id)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button>
                    <button onClick={() => { setEditing(null); setDraft({}); }} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => { setEditing(r.id); setDraft({}); }} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>
                    {r.staffCount === 0 && <button onClick={() => handleDelete(r.id, r.roleCode)} className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded">Delete</button>}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Departments ──────────────────────────────────────────────────────────

function DepartmentsPanel() {
  const { data, error, isLoading, mutate } = useSWR<DepartmentRow[]>("/api/admin/departments", apiFetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ deptCode: "", deptName: "" });
  const [addError, setAddError] = useState("");

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load departments" />;
  const rows = data ?? [];

  async function save(id: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/departments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, deptName: draftName }) });
      setEditing(null); mutate();
    } finally { setSaving(false); }
  }
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setAddError("");
    if (!addForm.deptCode || !addForm.deptName) { setAddError("Code and name required"); return; }
    try {
      const res = await fetch("/api/admin/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addForm) });
      const json = await res.json();
      if (!json.success) { setAddError(json.error?.message ?? "Failed"); return; }
      setShowAdd(false); setAddForm({ deptCode: "", deptName: "" }); mutate();
    } catch { setAddError("Network error"); }
  }
  async function handleDelete(id: string, code: string) {
    if (!confirm(`Delete department "${code}"?`)) return;
    const res = await fetch("/api/admin/departments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const json = await res.json();
    if (!json.success) alert(json.error?.message ?? "Cannot delete"); else mutate();
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Departments" action={
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Department
        </button>
      } />
      {showAdd && (
        <form onSubmit={handleAdd} className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-end gap-3">
          <label className="block"><span className="text-xs font-medium text-gray-600">Code</span><input value={addForm.deptCode} onChange={(e) => setAddForm({...addForm, deptCode: e.target.value})} className="mt-1 block w-24 rounded border border-gray-300 px-2 py-1 text-sm" placeholder="e.g. HR" /></label>
          <label className="block flex-1"><span className="text-xs font-medium text-gray-600">Name</span><input value={addForm.deptName} onChange={(e) => setAddForm({...addForm, deptName: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="e.g. Human Resources" /></label>
          <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700">Add</button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
          {addError && <span className="text-xs text-red-600">{addError}</span>}
        </form>
      )}
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50"><tr>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Code</th>
          <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
          <th className="px-4 py-2 text-right font-medium text-gray-500">Active Staff</th>
          <th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-700 font-mono text-xs">{r.deptCode}</td>
              <td className="px-4 py-2">{editing === r.id ? <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" defaultValue={r.deptName} onChange={(e) => setDraftName(e.target.value)} /> : <span className="text-gray-800">{r.deptName}</span>}</td>
              <td className="px-4 py-2 text-right text-gray-600">{r.staffCount}</td>
              <td className="px-4 py-2 text-right">
                {editing === r.id ? (
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => save(r.id)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditing(null)} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => { setEditing(r.id); setDraftName(r.deptName); }} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>
                    {r.staffCount === 0 && <button onClick={() => handleDelete(r.id, r.deptCode)} className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded">Delete</button>}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Permissions Matrix ───────────────────────────────────────────────────

function PermissionsPanel() {
  const { data, error, isLoading, mutate } = useSWR<RolePermission[]>("/api/admin/permissions", apiFetcher);
  const { data: rolesData } = useSWR<RoleRow[]>("/api/admin/roles", apiFetcher);
  const [saving, setSaving] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load permissions" />;

  const permissions = data ?? [];
  const roles = rolesData ?? [];

  function getAccess(roleId: string, moduleCode: string): string {
    return permissions.find((p) => p.roleId === roleId && p.moduleCode === moduleCode)?.accessLevel ?? "none";
  }

  async function setAccess(roleId: string, moduleCode: string, level: string) {
    setSaving(roleId);
    const rolePerms = MODULES.map((m) => ({
      moduleCode: m.code,
      accessLevel: m.code === moduleCode ? level : getAccess(roleId, m.code),
    }));
    try {
      await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, permissions: rolePerms }),
      });
      mutate();
    } finally { setSaving(null); }
  }

  const ACCESS_COLORS: Record<string, string> = {
    full: "bg-green-100 text-green-700 border-green-300",
    view: "bg-blue-100 text-blue-700 border-blue-300",
    none: "bg-gray-100 text-gray-400 border-gray-200",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Role Permissions" description="Control which modules each role can access" />
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 sticky left-0 bg-gray-50 z-10">Role</th>
              {MODULES.map((m) => (
                <th key={m.code} className="px-2 py-2 text-center font-medium text-gray-500 whitespace-nowrap">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {roles.map((role) => (
              <tr key={role.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                  {role.roleName}
                  <span className="text-gray-400 ml-1 font-mono">({role.roleCode})</span>
                </td>
                {MODULES.map((m) => {
                  const current = getAccess(role.id, m.code);
                  return (
                    <td key={m.code} className="px-2 py-2 text-center">
                      <select
                        value={current}
                        onChange={(e) => setAccess(role.id, m.code, e.target.value)}
                        disabled={saving === role.id}
                        className={`rounded border px-1.5 py-0.5 text-xs font-medium cursor-pointer ${ACCESS_COLORS[current] ?? ACCESS_COLORS.none}`}
                      >
                        <option value="none">None</option>
                        <option value="view">View</option>
                        <option value="full">Full</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Request Types ────────────────────────────────────────────────────────

function RequestTypesPanel() {
  const { data, error, isLoading, mutate } = useSWR<RequestType[]>("/api/admin/request-types", apiFetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<RequestType>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ typeName: "", domain: "Solution Design", slaAckDays: "1", slaClassifyDays: "2", slaRouteDays: "3" });
  const [addError, setAddError] = useState("");

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load request types" />;
  const rows = data ?? [];

  async function save(id: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/request-types", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...draft }) });
      setEditing(null); setDraft({}); mutate();
    } finally { setSaving(false); }
  }
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setAddError("");
    if (!addForm.typeName) { setAddError("Name is required"); return; }
    try {
      const res = await fetch("/api/admin/request-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...addForm, slaAckDays: +addForm.slaAckDays, slaClassifyDays: +addForm.slaClassifyDays, slaRouteDays: +addForm.slaRouteDays }) });
      const json = await res.json();
      if (!json.success) { setAddError(json.error?.message ?? "Failed"); return; }
      setShowAdd(false); mutate();
    } catch { setAddError("Network error"); }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Request Types & SLA Targets" action={
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Type
        </button>
      } />
      {showAdd && (
        <form onSubmit={handleAdd} className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-end gap-3 flex-wrap">
          <label className="block flex-1 min-w-[150px]"><span className="text-xs font-medium text-gray-600">Name</span><input value={addForm.typeName} onChange={(e) => setAddForm({...addForm, typeName: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" /></label>
          <label className="block"><span className="text-xs font-medium text-gray-600">Domain</span>
            <select value={addForm.domain} onChange={(e) => setAddForm({...addForm, domain: e.target.value})} className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm">
              <option>Solution Design</option><option>Consultancy</option><option>BIM</option><option>Project Monitoring</option>
            </select>
          </label>
          <label className="block w-16"><span className="text-xs font-medium text-gray-600">Ack</span><input type="number" min={1} value={addForm.slaAckDays} onChange={(e) => setAddForm({...addForm, slaAckDays: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm text-right" /></label>
          <label className="block w-16"><span className="text-xs font-medium text-gray-600">Classify</span><input type="number" min={1} value={addForm.slaClassifyDays} onChange={(e) => setAddForm({...addForm, slaClassifyDays: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm text-right" /></label>
          <label className="block w-16"><span className="text-xs font-medium text-gray-600">Route</span><input type="number" min={1} value={addForm.slaRouteDays} onChange={(e) => setAddForm({...addForm, slaRouteDays: e.target.value})} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm text-right" /></label>
          <button type="submit" className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded hover:bg-primary-700">Add</button>
          <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
          {addError && <span className="text-xs text-red-600">{addError}</span>}
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Code</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Type Name</th>
            <th className="px-4 py-2 text-left font-medium text-gray-500">Domain</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Ack</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Classify</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Route</th>
            <th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">{r.typeCode}</td>
                <td className="px-4 py-2">{editing === r.id ? <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" defaultValue={r.typeName} onChange={(e) => setDraft({...draft, typeName: e.target.value})} /> : <span className="text-gray-800">{r.typeName}</span>}</td>
                <td className="px-4 py-2 text-gray-600">{r.domain}</td>
                <td className="px-4 py-2 text-right">{editing === r.id ? <input type="number" min={1} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right" defaultValue={r.slaAckDays} onChange={(e) => setDraft({...draft, slaAckDays: +e.target.value})} /> : <span className="text-gray-700">{r.slaAckDays}</span>}</td>
                <td className="px-4 py-2 text-right">{editing === r.id ? <input type="number" min={1} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right" defaultValue={r.slaClassifyDays} onChange={(e) => setDraft({...draft, slaClassifyDays: +e.target.value})} /> : <span className="text-gray-700">{r.slaClassifyDays}</span>}</td>
                <td className="px-4 py-2 text-right">{editing === r.id ? <input type="number" min={1} className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right" defaultValue={r.slaRouteDays} onChange={(e) => setDraft({...draft, slaRouteDays: +e.target.value})} /> : <span className="text-gray-700">{r.slaRouteDays}</span>}</td>
                <td className="px-4 py-2 text-right">{editing === r.id ? (
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => save(r.id)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button>
                    <button onClick={() => { setEditing(null); setDraft({}); }} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
                  </div>
                ) : <button onClick={() => { setEditing(r.id); setDraft({}); }} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Complexity Tiers ─────────────────────────────────────────────────────

function ComplexityTiersPanel() {
  const { data, error, isLoading, mutate } = useSWR<ComplexityTier[]>("/api/admin/complexity-tiers", apiFetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ComplexityTier>>({});
  const [saving, setSaving] = useState(false);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load complexity tiers" />;
  const rows = data ?? [];
  async function save(id: string) {
    setSaving(true);
    try { await fetch("/api/admin/complexity-tiers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...draft }) }); setEditing(null); setDraft({}); mutate(); } finally { setSaving(false); }
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Complexity Tiers" />
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left font-medium text-gray-500">Tier</th><th className="px-4 py-2 text-left font-medium text-gray-500">Name</th><th className="px-4 py-2 text-left font-medium text-gray-500">Approver Role</th><th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-700">Tier {r.tierCode}</td>
              <td className="px-4 py-2">{editing === r.id ? <input className="w-full rounded border border-gray-300 px-2 py-1 text-sm" defaultValue={r.tierName} onChange={(e) => setDraft({...draft, tierName: e.target.value})} /> : <span className="text-gray-800">{r.tierName}</span>}</td>
              <td className="px-4 py-2 text-gray-600">{r.approverRoleName}</td>
              <td className="px-4 py-2 text-right">{editing === r.id ? (
                <div className="flex gap-1 justify-end"><button onClick={() => save(r.id)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button><button onClick={() => { setEditing(null); setDraft({}); }} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button></div>
              ) : <button onClick={() => { setEditing(r.id); setDraft({}); }} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Baseline Tiers ───────────────────────────────────────────────────────

function BaselineTiersPanel() {
  const { data, error, isLoading } = useSWR<BaselineTier[]>("/api/admin/baseline-tiers", async () => {
    const res = await apiFetcher("/api/admin") as { baselineTiers: BaselineTier[] };
    return res.baselineTiers;
  });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load baseline tiers" />;
  const rows = data ?? [];
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Baseline Hours by Tier Size" description="Read-only reference values" />
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left font-medium text-gray-500">Tier Size</th><th className="px-4 py-2 text-right font-medium text-gray-500">CSI Hours</th><th className="px-4 py-2 text-right font-medium text-gray-500">CMT Hours</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => <tr key={r.id} className="hover:bg-gray-50"><td className="px-4 py-2 text-gray-800 font-medium">{r.tierSize}</td><td className="px-4 py-2 text-right text-gray-700">{r.baselineCSIHours}</td><td className="px-4 py-2 text-right text-gray-700">{r.baselineCMTHours}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

// ─── Multiplier Factors ───────────────────────────────────────────────────

function MultiplierFactorsPanel() {
  const { data, error, isLoading, mutate } = useSWR<MultiplierFactor[]>("/api/admin/multiplier-factors", apiFetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load multiplier factors" />;
  const rows = data ?? [];
  async function save(id: string) {
    setSaving(true);
    try { await fetch("/api/admin/multiplier-factors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, multiplierValue: draftValue }) }); setEditing(null); mutate(); } finally { setSaving(false); }
  }
  const LABELS: Record<string, string> = { Rush: "Rush Job", Consortium: "Consortium Project", SecurityHeavy: "Security-Heavy", CustomDev: "Custom Development", ManyQA: "Extensive QA", Onsite: "Onsite Work" };
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Multiplier Factors" description="Applied to baseline hours for capacity estimation" />
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left font-medium text-gray-500">Factor</th><th className="px-4 py-2 text-right font-medium text-gray-500">Multiplier</th><th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 text-gray-800">{LABELS[r.factorCode] ?? r.factorCode}</td>
              <td className="px-4 py-2 text-right">{editing === r.id ? <input type="number" step="0.1" min="0.1" max="10" className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-right" defaultValue={r.multiplierValue} onChange={(e) => setDraftValue(+e.target.value)} /> : <span className="text-gray-700 font-mono">{r.multiplierValue.toFixed(2)}x</span>}</td>
              <td className="px-4 py-2 text-right">{editing === r.id ? (
                <div className="flex gap-1 justify-end"><button onClick={() => save(r.id)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button><button onClick={() => setEditing(null)} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button></div>
              ) : <button onClick={() => { setEditing(r.id); setDraftValue(r.multiplierValue); }} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Role Split ───────────────────────────────────────────────────────────

function RoleSplitPanel() {
  const { data, error, isLoading, mutate } = useSWR<RoleSplit[]>("/api/admin/role-split", apiFetcher);
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [draftSplits, setDraftSplits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [valErr, setValErr] = useState<string | null>(null);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load role splits" />;
  const rows = data ?? [];
  const depts = [...new Set(rows.map((r) => r.deptCode))].sort();
  const byDept = (d: string) => rows.filter((r) => r.deptCode === d);
  function startEdit(dc: string) {
    const dr = byDept(dc); const init: Record<string, number> = {};
    for (const r of dr) init[r.roleId] = r.percentage;
    setDraftSplits(init); setEditingDept(dc); setValErr(null);
  }
  async function saveSplits(dc: string) {
    const dr = byDept(dc); const deptId = dr[0]?.deptId; if (!deptId) return;
    const rs = Object.entries(draftSplits).map(([roleId, percentage]) => ({ roleId, percentage }));
    const sum = rs.reduce((a, r) => a + r.percentage, 0);
    if (Math.abs(sum - 100) >= 0.01) { setValErr(`Sum is ${sum.toFixed(1)}%, must be 100%`); return; }
    setSaving(true); setValErr(null);
    try { await fetch("/api/admin/role-split", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deptId, roleSplits: rs }) }); setEditingDept(null); setDraftSplits({}); mutate(); } finally { setSaving(false); }
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Role Split by Department" description="Percentages must sum to exactly 100% per department" />
      {valErr && <div className="mx-4 mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{valErr}</div>}
      {depts.map((dept) => {
        const dr = byDept(dept); const isEd = editingDept === dept;
        const sum = isEd ? Object.values(draftSplits).reduce((a, b) => a + b, 0) : dr.reduce((a, r) => a + r.percentage, 0);
        return (
          <div key={dept} className="border-b border-gray-100 last:border-b-0">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50/50">
              <span className="text-sm font-medium text-gray-700">{dept}</span>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono ${Math.abs(sum - 100) < 0.01 ? "text-green-600" : "text-red-600"}`}>{sum.toFixed(1)}%</span>
                {isEd ? (<div className="flex gap-1"><button onClick={() => saveSplits(dept)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button><button onClick={() => { setEditingDept(null); setValErr(null); }} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button></div>
                ) : <button onClick={() => startEdit(dept)} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>}
              </div>
            </div>
            <table className="min-w-full text-sm"><tbody>
              {dr.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-1.5 text-gray-600 w-32">{r.roleCode}</td>
                  <td className="px-4 py-1.5 text-gray-700">{r.roleName}</td>
                  <td className="px-4 py-1.5 text-right w-32">{isEd ? <input type="number" min={0} max={100} step={0.1} className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-right" value={draftSplits[r.roleId] ?? 0} onChange={(e) => setDraftSplits({...draftSplits, [r.roleId]: +e.target.value})} /> : <span className="font-mono text-gray-700">{r.percentage.toFixed(1)}%</span>}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        );
      })}
    </div>
  );
}

// ─── System Settings ──────────────────────────────────────────────────────

function SettingsPanel() {
  const { data, error, isLoading, mutate } = useSWR<SystemSetting[]>("/api/admin/settings", apiFetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load settings" />;
  const rows = data ?? [];

  const CATEGORIES: Record<string, string> = {
    "capacity.": "Capacity",
    "wo.": "Work Order",
    "notification.": "Notifications",
  };

  function getCategory(key: string): string {
    for (const [prefix, label] of Object.entries(CATEGORIES)) {
      if (key.startsWith(prefix)) return label;
    }
    return "General";
  }

  const grouped = rows.reduce<Record<string, SystemSetting[]>>((acc, r) => {
    const cat = getCategory(r.settingKey);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  async function save(key: string) {
    setSaving(true);
    try { await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, settingValue: draftValue }) }); setEditing(null); mutate(); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([category, settings]) => (
        <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <SectionHeader title={category} />
          <div className="divide-y divide-gray-100">
            {settings.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-start gap-4 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 font-mono">{r.settingKey}</p>
                  {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {editing === r.settingKey ? (
                    <>
                      {r.settingKey.startsWith("notification.") ? (
                        <select value={draftValue} onChange={(e) => setDraftValue(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
                          <option value="true">Enabled</option><option value="false">Disabled</option>
                        </select>
                      ) : (
                        <input className="w-48 rounded border border-gray-300 px-2 py-1 text-sm" value={draftValue} onChange={(e) => setDraftValue(e.target.value)} />
                      )}
                      <button onClick={() => save(r.settingKey)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button>
                      <button onClick={() => setEditing(null)} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
                    </>
                  ) : (
                    <>
                      {r.settingKey.startsWith("notification.") ? (
                        <Badge className={r.settingValue === "true" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                          {r.settingValue === "true" ? "Enabled" : "Disabled"}
                        </Badge>
                      ) : (
                        <span className="text-sm text-gray-700 font-mono bg-gray-100 px-2 py-0.5 rounded">{r.settingValue}</span>
                      )}
                      <button onClick={() => { setEditing(r.settingKey); setDraftValue(r.settingValue); }} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No system settings configured</div>}
    </div>
  );
}

// ─── Staff Management ─────────────────────────────────────────────────────

function StaffPanel() {
  const [statusFilter, setStatusFilter] = useState("Active");
  const { data, error, isLoading, mutate } = useSWR<StaffAdmin[]>(`/api/admin/staff?status=${statusFilter}`, apiFetcher);
  const { data: lookups } = useSWR<{ departments: LookupOption[]; roles: LookupOption[] }>("/api/lookups", apiFetcher);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load staff" />;
  const rows = data ?? [];
  const departments = lookups?.departments ?? [];
  const roles = lookups?.roles ?? [];

  async function save(staffId: string) {
    setSaving(true);
    try { await fetch("/api/admin/staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId, ...draft }) }); setEditing(null); setDraft({}); mutate(); } finally { setSaving(false); }
  }

  const STATUS_COLORS: Record<string, string> = { Active: "bg-green-100 text-green-700", Inactive: "bg-gray-100 text-gray-700", OnLeave: "bg-yellow-100 text-yellow-700" };

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader title="Staff Management" action={
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {["Active", "Inactive", "OnLeave"].map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 text-xs rounded-full transition-colors ${statusFilter === s ? "bg-primary-600 text-white" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}>
                  {s === "OnLeave" ? "On Leave" : s}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add Staff
            </button>
          </div>
        } />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Code</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Email</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Dept</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Role</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Team</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Prod.</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Hrs/Day</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Status</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Admin</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.staffCode}</td>
                  <td className="px-3 py-2">{editing === r.id ? <input className="w-full rounded border border-gray-300 px-1 py-0.5 text-sm" defaultValue={r.name} onChange={(e) => setDraft({...draft, name: e.target.value})} /> : <span className="text-gray-800">{r.name}</span>}</td>
                  <td className="px-3 py-2">{editing === r.id ? <input type="email" className="w-full rounded border border-gray-300 px-1 py-0.5 text-sm" defaultValue={r.email} onChange={(e) => setDraft({...draft, email: e.target.value})} /> : <span className="text-gray-500 text-xs">{r.email}</span>}</td>
                  <td className="px-3 py-2 text-gray-600">{editing === r.id ? (
                    <select className="rounded border border-gray-300 px-1 py-0.5 text-xs" defaultValue={r.deptId} onChange={(e) => setDraft({...draft, deptId: e.target.value})}>
                      {departments.map((d: LookupOption) => <option key={d.Id} value={d.Id}>{d.DeptCode}</option>)}
                    </select>
                  ) : r.deptCode}</td>
                  <td className="px-3 py-2 text-gray-600">{editing === r.id ? (
                    <select className="rounded border border-gray-300 px-1 py-0.5 text-xs" defaultValue={r.roleId} onChange={(e) => setDraft({...draft, roleId: e.target.value})}>
                      {roles.map((rl: LookupOption) => <option key={rl.Id} value={rl.Id}>{rl.RoleName}</option>)}
                    </select>
                  ) : r.roleName}</td>
                  <td className="px-3 py-2 text-center text-gray-600">{editing === r.id ? (
                    <select className="rounded border border-gray-300 px-1 py-0.5 text-xs" defaultValue={r.subTeam ?? ""} onChange={(e) => setDraft({...draft, subTeam: e.target.value || null})}>
                      <option value="">—</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                    </select>
                  ) : (r.subTeam ?? "—")}</td>
                  <td className="px-3 py-2 text-right">{editing === r.id ? <input type="number" step="0.1" min="0.1" max="1.0" className="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm text-right" defaultValue={r.productivityFactor} onChange={(e) => setDraft({...draft, productivityFactor: +e.target.value})} /> : <span className="font-mono text-gray-700">{r.productivityFactor.toFixed(1)}</span>}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-600" title="8 × Prod. Factor">{(8 * (editing === r.id && draft.productivityFactor !== undefined ? (draft.productivityFactor as number) : r.productivityFactor)).toFixed(1)}</td>
                  <td className="px-3 py-2 text-center">{editing === r.id ? (
                    <select className="rounded border border-gray-300 px-1 py-0.5 text-xs" defaultValue={r.status} onChange={(e) => setDraft({...draft, status: e.target.value})}>
                      <option value="Active">Active</option><option value="Inactive">Inactive</option><option value="OnLeave">On Leave</option>
                    </select>
                  ) : <Badge className={STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}>{r.status === "OnLeave" ? "On Leave" : r.status}</Badge>}</td>
                  <td className="px-3 py-2 text-center">{editing === r.id ? <input type="checkbox" defaultChecked={r.systemConfigFlag} onChange={(e) => setDraft({...draft, systemConfigFlag: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-primary-600" /> : <span className={`text-xs ${r.systemConfigFlag ? "text-green-600" : "text-gray-400"}`}>{r.systemConfigFlag ? "Yes" : "—"}</span>}</td>
                  <td className="px-3 py-2 text-right">{editing === r.id ? (
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => save(r.id)} disabled={saving} className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">Save</button>
                      <button onClick={() => { setEditing(null); setDraft({}); }} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
                    </div>
                  ) : <button onClick={() => { setEditing(r.id); setDraft({}); }} className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">Edit</button>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500">No staff with status &quot;{statusFilter}&quot;</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd && <AddStaffForm onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); mutate(); }} />}
    </>
  );
}

function AddStaffForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: lookups } = useSWR<{ departments: LookupOption[]; roles: LookupOption[] }>("/api/lookups", apiFetcher);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ staffCode: "", name: "", email: "", roleId: "", deptId: "", subTeam: "", productivityFactor: "0.8" });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staffCode || !form.name || !form.email || !form.roleId || !form.deptId) { setError("All required fields must be filled"); return; }
    setSubmitting(true); setError("");
    try {
      const body: Record<string, unknown> = { staffCode: form.staffCode, name: form.name, email: form.email, roleId: form.roleId, deptId: form.deptId, productivityFactor: parseFloat(form.productivityFactor) };
      if (form.subTeam) body.subTeam = form.subTeam;
      const res = await fetch("/api/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Error ${res.status}`); return; }
      onSuccess();
    } catch { setError("Network error"); } finally { setSubmitting(false); }
  };
  const departments = lookups?.departments ?? [];
  const roles = lookups?.roles ?? [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Staff Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block"><span className="text-sm font-medium text-gray-700">Staff Code *</span><input type="text" value={form.staffCode} onChange={(e) => setForm((f) => ({...f, staffCode: e.target.value}))} placeholder="e.g. CSI-001" className="mt-1 input-field" /></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">Full Name *</span><input type="text" value={form.name} onChange={(e) => setForm((f) => ({...f, name: e.target.value}))} className="mt-1 input-field" /></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">Email *</span><input type="email" value={form.email} onChange={(e) => setForm((f) => ({...f, email: e.target.value}))} className="mt-1 input-field" /></label>
            <label className="block"><span className="text-sm font-medium text-gray-700">Department *</span>
              <select value={form.deptId} onChange={(e) => setForm((f) => ({...f, deptId: e.target.value}))} className="mt-1 input-field">
                <option value="">Select...</option>{departments.map((d: LookupOption) => <option key={d.Id} value={d.Id}>{d.DeptCode} — {d.DeptName}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium text-gray-700">Role *</span>
              <select value={form.roleId} onChange={(e) => setForm((f) => ({...f, roleId: e.target.value}))} className="mt-1 input-field">
                <option value="">Select...</option>{roles.map((r: LookupOption) => <option key={r.Id} value={r.Id}>{r.RoleName}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block"><span className="text-sm font-medium text-gray-700">Sub-Team</span>
                <select value={form.subTeam} onChange={(e) => setForm((f) => ({...f, subTeam: e.target.value}))} className="mt-1 input-field">
                  <option value="">None</option><option value="A">Pod A</option><option value="B">Pod B</option><option value="C">Pod C</option><option value="D">Pod D</option>
                </select>
              </label>
              <label className="block"><span className="text-sm font-medium text-gray-700">Productivity Factor</span>
                <input type="number" step="0.1" min="0.1" max="1.0" value={form.productivityFactor} onChange={(e) => setForm((f) => ({...f, productivityFactor: e.target.value}))} className="mt-1 input-field" />
                <span className="text-xs text-gray-400 mt-0.5 block">Daily = 8 × {form.productivityFactor} = {(8 * parseFloat(form.productivityFactor || "0")).toFixed(1)}h</span>
              </label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creating..." : "Create Staff"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Audit Log ────────────────────────────────────────────────────────────

function AuditLogPanel() {
  const [filters, setFilters] = useState({ entityName: "", action: "", limit: 50, offset: 0 });
  const params = new URLSearchParams();
  if (filters.entityName) params.set("entityName", filters.entityName);
  if (filters.action) params.set("action", filters.action);
  params.set("limit", String(filters.limit));
  params.set("offset", String(filters.offset));

  const { data, error, isLoading } = useSWR<{ rows: AuditEntry[]; total: number }>(
    `/api/admin/audit-log?${params.toString()}`, apiFetcher
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load audit log" />;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const ACTION_COLORS: Record<string, string> = {
    Insert: "bg-green-100 text-green-700",
    Update: "bg-blue-100 text-blue-700",
    Delete: "bg-red-100 text-red-700",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <SectionHeader title="Audit Log" description={`${total} total entries`} />
      <div className="px-4 py-2 border-b border-gray-200 flex gap-3 items-end bg-gray-50/50">
        <label className="block"><span className="text-xs font-medium text-gray-500">Entity</span>
          <select value={filters.entityName} onChange={(e) => setFilters({...filters, entityName: e.target.value, offset: 0})} className="mt-1 block rounded border border-gray-300 px-2 py-1 text-xs">
            <option value="">All</option>
            {["CSI_WO", "STAFF", "ROLE", "DEPARTMENT", "REQUEST_TYPE", "COMPLEXITY_TIER", "MULTIPLIER_FACTOR", "ROLE_SPLIT", "ROLE_PERMISSION", "SYSTEM_SETTING", "ASSIGNMENT", "EFFORT_LOG", "APPROVAL_RECORD"].map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="block"><span className="text-xs font-medium text-gray-500">Action</span>
          <select value={filters.action} onChange={(e) => setFilters({...filters, action: e.target.value, offset: 0})} className="mt-1 block rounded border border-gray-300 px-2 py-1 text-xs">
            <option value="">All</option><option value="Insert">Insert</option><option value="Update">Update</option><option value="Delete">Delete</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50"><tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Time</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Entity</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Action</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Field</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">Old</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">New</th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">By</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(r.performedAt).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-3 py-2 text-gray-700 font-mono">{r.entityName}</td>
                <td className="px-3 py-2"><Badge className={ACTION_COLORS[r.action] ?? "bg-gray-100 text-gray-700"}>{r.action}</Badge></td>
                <td className="px-3 py-2 text-gray-600">{r.fieldName ?? "—"}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[150px] truncate" title={r.oldValue ?? ""}>{r.oldValue ?? "—"}</td>
                <td className="px-3 py-2 text-gray-700 max-w-[150px] truncate" title={r.newValue ?? ""}>{r.newValue ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.performedByName}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No audit entries found</td></tr>}
          </tbody>
        </table>
      </div>
      {total > filters.limit && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          <span>Showing {filters.offset + 1}–{Math.min(filters.offset + filters.limit, total)} of {total}</span>
          <div className="flex gap-1">
            <button disabled={filters.offset === 0} onClick={() => setFilters({...filters, offset: Math.max(0, filters.offset - filters.limit)})} className="px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50">Prev</button>
            <button disabled={filters.offset + filters.limit >= total} onClick={() => setFilters({...filters, offset: filters.offset + filters.limit})} className="px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task Templates Panel ─────────────────────────────────────────────────

interface TaskTemplate {
  id: string; requestTypeId: string; requestTypeName: string;
  taskName: string; scope: string; sortOrder: number;
}

function TaskTemplatesPanel() {
  const { data: requestTypes } = useSWR<RequestType[]>("/api/admin/request-types", apiFetcher);
  const [selectedRt, setSelectedRt] = useState<string>("");
  const apiUrl = selectedRt
    ? `/api/admin/task-templates?requestTypeId=${selectedRt}`
    : "/api/admin/task-templates";
  const { data: templates, error, isLoading, mutate } = useSWR<TaskTemplate[]>(apiUrl, apiFetcher);
  const [newTask, setNewTask] = useState("");
  const [newScope, setNewScope] = useState("Internal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!selectedRt || !newTask.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestTypeId: selectedRt, taskName: newTask.trim(), scope: newScope }),
      });
      setNewTask("");
      mutate();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await fetch("/api/admin/task-templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    mutate();
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/admin/task-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, taskName: editName.trim() }),
      });
      setEditingId(null);
      mutate();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  const grouped = (templates ?? []).reduce<Record<string, TaskTemplate[]>>((acc, t) => {
    const key = t.requestTypeName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div>
      <SectionHeader
        title="Task Templates"
        description="Default checklist tasks auto-added when a new WO is created for each request type"
      />
      <div className="p-4 space-y-4">
        {/* Request type filter */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-gray-600">Request Type:</label>
          <select
            value={selectedRt}
            onChange={(e) => setSelectedRt(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm flex-1 max-w-xs"
          >
            <option value="">All Request Types</option>
            {(requestTypes ?? []).map((rt) => (
              <option key={rt.id} value={rt.id}>{rt.typeName} ({rt.domain})</option>
            ))}
          </select>
        </div>

        {/* Add new template */}
        {selectedRt && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="New task name..."
              className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={saving || !newTask.trim()}
              className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              + Add
            </button>
          </div>
        )}

        {isLoading && <Spinner />}
        {error && <ErrorBox message="Failed to load task templates" />}

        {/* Template list */}
        {!isLoading && Object.keys(grouped).length === 0 && (
          <div className="text-center py-8 text-sm text-gray-400">
            {selectedRt ? "No templates for this request type. Add one above." : "No task templates configured yet. Select a request type to start."}
          </div>
        )}

        {Object.entries(grouped).map(([typeName, tasks]) => (
          <div key={typeName} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">{typeName}</h3>
              <p className="text-xs text-gray-400">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="divide-y divide-gray-100">
              {tasks.map((t, idx) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
                  <span className="text-xs text-gray-400 w-6 text-right">{idx + 1}.</span>
                  {editingId === t.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(t.id)}
                        autoFocus
                      />
                      <button onClick={() => handleUpdate(t.id)} disabled={saving} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-700">{t.taskName}</span>
                      <Badge className="bg-gray-100 text-gray-600">{t.scope}</Badge>
                      <button onClick={() => { setEditingId(t.id); setEditName(t.taskName); }} className="text-xs text-gray-400 hover:text-primary-600">Edit</button>
                      <button onClick={() => handleDelete(t.id)} className="text-xs text-gray-400 hover:text-red-600">Delete</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
