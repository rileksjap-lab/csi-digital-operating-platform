"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";

// ─── Types ──────────────────────────────────────────────────────────────────

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
interface AdminData {
  requestTypes: RequestType[];
  complexityTiers: ComplexityTier[];
  multiplierFactors: MultiplierFactor[];
  roleSplits: RoleSplit[];
  settings: SystemSetting[];
  baselineTiers: BaselineTier[];
}

type Section =
  | "pending-approvals"
  | "request-types"
  | "complexity-tiers"
  | "baseline-tiers"
  | "multiplier-factors"
  | "role-split"
  | "settings"
  | "staff";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "pending-approvals", label: "Pending Approvals" },
  { key: "request-types", label: "Request Types & SLA" },
  { key: "complexity-tiers", label: "Complexity Tiers" },
  { key: "baseline-tiers", label: "Baseline Tiers" },
  { key: "multiplier-factors", label: "Multiplier Factors" },
  { key: "role-split", label: "Role Split %" },
  { key: "settings", label: "System Settings" },
  { key: "staff", label: "Staff Management" },
];

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" />
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {message}
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [section, setSection] = useState<Section>("pending-approvals");

  if (!user?.systemConfigFlag) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-gray-800">Admin & Master Data</h1>
        <ErrorBox message="You do not have System Configuration access. Contact your administrator." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">Admin & Master Data</h1>

      <div className="flex gap-6">
        {/* Left sub-nav */}
        <nav className="w-56 shrink-0 space-y-1">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                section === s.key
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Right content pane */}
        <div className="flex-1 min-w-0">
          {section === "pending-approvals" && <PendingApprovalsPanel />}
          {section === "request-types" && <RequestTypesPanel />}
          {section === "complexity-tiers" && <ComplexityTiersPanel />}
          {section === "baseline-tiers" && <BaselineTiersPanel />}
          {section === "multiplier-factors" && <MultiplierFactorsPanel />}
          {section === "role-split" && <RoleSplitPanel />}
          {section === "settings" && <SettingsPanel />}
          {section === "staff" && <StaffPanel />}
        </div>
      </div>
    </div>
  );
}

// ─── Pending Approvals panel ───────────────────────────────────────────────

interface PendingStaff {
  id: string;
  staffCode: string;
  name: string;
  email: string;
  deptName: string;
  deptCode: string;
  status: string;
  createdAt: string;
}

interface LookupRole { Id: string; RoleCode?: string; RoleName?: string }

function PendingApprovalsPanel() {
  const { data, error, isLoading, mutate } = useSWR<PendingStaff[]>(
    "/api/admin/pending-staff",
    apiFetcher
  );
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
    setActing(staffId);
    setActionError("");
    try {
      const body: Record<string, string> = { staffId, action };
      if (action === "approve" && selectedRole[staffId]) {
        body.roleId = selectedRole[staffId];
      }
      const res = await fetch("/api/admin/pending-staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error?.message ?? "Action failed");
        return;
      }
      mutate();
    } catch {
      setActionError("Network error");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">
            Pending Registrations
            {pendingRows.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendingRows.length}
              </span>
            )}
          </h2>
        </div>

        {actionError && (
          <div className="mx-4 mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {actionError}
          </div>
        )}

        {pendingRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No pending registrations
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pendingRows.map((r) => (
              <div key={r.id} className="px-4 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{r.name}</p>
                  <p className="text-sm text-gray-500">{r.email}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Department: {r.deptName} ({r.deptCode}) &middot; Registered: {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedRole[r.id] ?? ""}
                    onChange={(e) => setSelectedRole({ ...selectedRole, [r.id]: e.target.value })}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                  >
                    <option value="">Assign role...</option>
                    {roles.map((role: LookupRole) => (
                      <option key={role.Id} value={role.Id}>{role.RoleName}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAction(r.id, "approve")}
                    disabled={acting === r.id}
                    className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(r.id, "reject")}
                    disabled={acting === r.id}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rejectedRows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Recently Rejected</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Email</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Dept</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rejectedRows.map((r) => (
                  <tr key={r.id} className="text-gray-500">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">{r.email}</td>
                    <td className="px-4 py-2">{r.deptCode}</td>
                    <td className="px-4 py-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Request Types panel ────────────────────────────────────────────────────

function RequestTypesPanel() {
  const { data, error, isLoading, mutate } = useSWR<RequestType[]>(
    "/api/admin/request-types",
    apiFetcher
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<RequestType>>({});
  const [saving, setSaving] = useState(false);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load request types" />;
  const rows = data ?? [];

  async function save(id: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/request-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...draft }),
      });
      setEditing(null);
      setDraft({});
      mutate();
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Request Types & SLA Targets</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Code</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Type Name</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Domain</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Ack (days)</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Classify (days)</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Route (days)</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">{r.typeCode}</td>
                <td className="px-4 py-2">
                  {editing === r.id ? (
                    <input
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      defaultValue={r.typeName}
                      onChange={(e) => setDraft({ ...draft, typeName: e.target.value })}
                    />
                  ) : (
                    <span className="text-gray-800">{r.typeName}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">{r.domain}</td>
                <td className="px-4 py-2 text-right">
                  {editing === r.id ? (
                    <input
                      type="number" min={1}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                      defaultValue={r.slaAckDays}
                      onChange={(e) => setDraft({ ...draft, slaAckDays: +e.target.value })}
                    />
                  ) : (
                    <span className="text-gray-700">{r.slaAckDays}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {editing === r.id ? (
                    <input
                      type="number" min={1}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                      defaultValue={r.slaClassifyDays}
                      onChange={(e) => setDraft({ ...draft, slaClassifyDays: +e.target.value })}
                    />
                  ) : (
                    <span className="text-gray-700">{r.slaClassifyDays}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {editing === r.id ? (
                    <input
                      type="number" min={1}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                      defaultValue={r.slaRouteDays}
                      onChange={(e) => setDraft({ ...draft, slaRouteDays: +e.target.value })}
                    />
                  ) : (
                    <span className="text-gray-700">{r.slaRouteDays}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {editing === r.id ? (
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => save(r.id)}
                        disabled={saving}
                        className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditing(null); setDraft({}); }}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditing(r.id); setDraft({}); }}
                      className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Complexity Tiers panel ─────────────────────────────────────────────────

function ComplexityTiersPanel() {
  const { data, error, isLoading, mutate } = useSWR<ComplexityTier[]>(
    "/api/admin/complexity-tiers",
    apiFetcher
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ComplexityTier>>({});
  const [saving, setSaving] = useState(false);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load complexity tiers" />;
  const rows = data ?? [];

  async function save(id: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/complexity-tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...draft }),
      });
      setEditing(null);
      setDraft({});
      mutate();
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Complexity Tiers</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Tier</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Approver Role</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700">Tier {r.tierCode}</td>
                <td className="px-4 py-2">
                  {editing === r.id ? (
                    <input
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      defaultValue={r.tierName}
                      onChange={(e) => setDraft({ ...draft, tierName: e.target.value })}
                    />
                  ) : (
                    <span className="text-gray-800">{r.tierName}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">{r.approverRoleName}</td>
                <td className="px-4 py-2 text-right">
                  {editing === r.id ? (
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => save(r.id)} disabled={saving}
                        className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={() => { setEditing(null); setDraft({}); }}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditing(r.id); setDraft({}); }}
                      className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Baseline Tiers panel ───────────────────────────────────────────────────

function BaselineTiersPanel() {
  const { data, error, isLoading } = useSWR<BaselineTier[]>(
    "/api/admin/baseline-tiers",
    async (url: string) => {
      const res = await apiFetcher("/api/admin") as AdminData;
      return res.baselineTiers;
    }
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load baseline tiers" />;
  const rows = data ?? [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Baseline Hours by Tier Size</h2>
        <p className="text-xs text-gray-500 mt-0.5">Read-only reference values from the database</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Tier Size</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">CSI Hours</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">CMT Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-800 font-medium">{r.tierSize}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.baselineCSIHours}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.baselineCMTHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Multiplier Factors panel ───────────────────────────────────────────────

function MultiplierFactorsPanel() {
  const { data, error, isLoading, mutate } = useSWR<MultiplierFactor[]>(
    "/api/admin/multiplier-factors",
    apiFetcher
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load multiplier factors" />;
  const rows = data ?? [];

  async function save(id: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/multiplier-factors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, multiplierValue: draftValue }),
      });
      setEditing(null);
      mutate();
    } finally { setSaving(false); }
  }

  const FACTOR_LABELS: Record<string, string> = {
    Rush: "Rush Job",
    Consortium: "Consortium Project",
    SecurityHeavy: "Security-Heavy",
    CustomDev: "Custom Development",
    ManyQA: "Extensive QA",
    Onsite: "Onsite Work",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Multiplier Factors</h2>
        <p className="text-xs text-gray-500 mt-0.5">Applied to baseline hours for capacity estimation</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Factor</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Multiplier</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-800">{FACTOR_LABELS[r.factorCode] ?? r.factorCode}</td>
                <td className="px-4 py-2 text-right">
                  {editing === r.id ? (
                    <input
                      type="number" step="0.1" min="0.1" max="10"
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                      defaultValue={r.multiplierValue}
                      onChange={(e) => setDraftValue(+e.target.value)}
                    />
                  ) : (
                    <span className="text-gray-700 font-mono">{r.multiplierValue.toFixed(2)}x</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {editing === r.id ? (
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => save(r.id)} disabled={saving}
                        className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={() => setEditing(null)}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditing(r.id); setDraftValue(r.multiplierValue); }}
                      className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Role Split panel ───────────────────────────────────────────────────────

function RoleSplitPanel() {
  const { data, error, isLoading, mutate } = useSWR<RoleSplit[]>(
    "/api/admin/role-split",
    apiFetcher
  );
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [draftSplits, setDraftSplits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load role splits" />;

  const rows = data ?? [];
  const depts = [...new Set(rows.map((r) => r.deptCode))].sort();
  const byDept = (dept: string) => rows.filter((r) => r.deptCode === dept);

  function startEdit(deptCode: string) {
    const deptRows = byDept(deptCode);
    const initial: Record<string, number> = {};
    for (const r of deptRows) initial[r.roleId] = r.percentage;
    setDraftSplits(initial);
    setEditingDept(deptCode);
    setValidationError(null);
  }

  async function saveSplits(deptCode: string) {
    const deptRows = byDept(deptCode);
    const deptId = deptRows[0]?.deptId;
    if (!deptId) return;

    const roleSplits = Object.entries(draftSplits).map(([roleId, percentage]) => ({
      roleId,
      percentage,
    }));
    const sum = roleSplits.reduce((acc, r) => acc + r.percentage, 0);
    if (Math.abs(sum - 100) >= 0.01) {
      setValidationError(`Percentages sum to ${sum.toFixed(1)}%, must equal 100%`);
      return;
    }

    setSaving(true);
    setValidationError(null);
    try {
      await fetch("/api/admin/role-split", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deptId, roleSplits }),
      });
      setEditingDept(null);
      setDraftSplits({});
      mutate();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Role Split by Department</h2>
          <p className="text-xs text-gray-500 mt-0.5">Percentages must sum to exactly 100% per department</p>
        </div>

        {validationError && (
          <div className="mx-4 mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {validationError}
          </div>
        )}

        {depts.map((dept) => {
          const deptRows = byDept(dept);
          const isEditing = editingDept === dept;
          const sum = isEditing
            ? Object.values(draftSplits).reduce((a, b) => a + b, 0)
            : deptRows.reduce((a, r) => a + r.percentage, 0);

          return (
            <div key={dept} className="border-b border-gray-100 last:border-b-0">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50/50">
                <span className="text-sm font-medium text-gray-700">{dept}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-mono ${Math.abs(sum - 100) < 0.01 ? "text-green-600" : "text-red-600"}`}>
                    Total: {sum.toFixed(1)}%
                  </span>
                  {isEditing ? (
                    <div className="flex gap-1">
                      <button onClick={() => saveSplits(dept)} disabled={saving}
                        className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={() => { setEditingDept(null); setValidationError(null); }}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(dept)}
                      className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <table className="min-w-full text-sm">
                <tbody>
                  {deptRows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-1.5 text-gray-600 w-32">{r.roleCode}</td>
                      <td className="px-4 py-1.5 text-gray-700">{r.roleName}</td>
                      <td className="px-4 py-1.5 text-right w-32">
                        {isEditing ? (
                          <input
                            type="number" min={0} max={100} step={0.1}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm text-right"
                            value={draftSplits[r.roleId] ?? 0}
                            onChange={(e) =>
                              setDraftSplits({ ...draftSplits, [r.roleId]: +e.target.value })
                            }
                          />
                        ) : (
                          <span className="font-mono text-gray-700">{r.percentage.toFixed(1)}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── System Settings panel ──────────────────────────────────────────────────

function SettingsPanel() {
  const { data, error, isLoading, mutate } = useSWR<SystemSetting[]>(
    "/api/admin/settings",
    apiFetcher
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load settings" />;
  const rows = data ?? [];

  async function save(key: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, settingValue: draftValue }),
      });
      setEditing(null);
      mutate();
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">System Settings</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-3 flex items-start gap-4 hover:bg-gray-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 font-mono">{r.settingKey}</p>
              {r.description && (
                <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {editing === r.settingKey ? (
                <>
                  <input
                    className="w-48 rounded border border-gray-300 px-2 py-1 text-sm"
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                  />
                  <button onClick={() => save(r.settingKey)} disabled={saving}
                    className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
                    Save
                  </button>
                  <button onClick={() => setEditing(null)}
                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-700 font-mono bg-gray-100 px-2 py-0.5 rounded">
                    {r.settingValue}
                  </span>
                  <button onClick={() => { setEditing(r.settingKey); setDraftValue(r.settingValue); }}
                    className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No system settings configured</div>
        )}
      </div>
    </div>
  );
}

// ─── Staff Management panel ─────────────────────────────────────────────────

function StaffPanel() {
  const [statusFilter, setStatusFilter] = useState("Active");
  const { data, error, isLoading, mutate } = useSWR<StaffAdmin[]>(
    `/api/admin/staff?status=${statusFilter}`,
    apiFetcher
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load staff" />;
  const rows = data ?? [];

  async function save(staffId: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, ...draft }),
      });
      setEditing(null);
      setDraft({});
      mutate();
    } finally { setSaving(false); }
  }

  const STATUS_COLORS: Record<string, string> = {
    Active: "bg-green-100 text-green-700",
    Inactive: "bg-gray-100 text-gray-700",
    OnLeave: "bg-yellow-100 text-yellow-700",
  };

  return (
    <>
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Staff Management</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {["Active", "Inactive", "OnLeave"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  statusFilter === s
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                }`}
              >
                {s === "OnLeave" ? "On Leave" : s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Staff
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Staff Code</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Dept</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Role</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Team</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Prod. Factor</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Hrs/Day</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Status</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Admin</th>
              <th className="px-3 py-2 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.staffCode}</td>
                <td className="px-3 py-2 text-gray-800">{r.name}</td>
                <td className="px-3 py-2 text-gray-600">{r.deptCode}</td>
                <td className="px-3 py-2 text-gray-600">{r.roleName}</td>
                <td className="px-3 py-2 text-center text-gray-600">{r.subTeam ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  {editing === r.id ? (
                    <input
                      type="number" step="0.1" min="0.1" max="1.0"
                      className="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm text-right"
                      defaultValue={r.productivityFactor}
                      onChange={(e) => setDraft({ ...draft, productivityFactor: +e.target.value })}
                    />
                  ) : (
                    <span className="font-mono text-gray-700">{r.productivityFactor.toFixed(1)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-600">
                  {r.dailyUsableHours.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-center">
                  {editing === r.id ? (
                    <select
                      className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                      defaultValue={r.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="OnLeave">On Leave</option>
                    </select>
                  ) : (
                    <Badge className={STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-700"}>
                      {r.status === "OnLeave" ? "On Leave" : r.status}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {editing === r.id ? (
                    <input
                      type="checkbox"
                      defaultChecked={r.systemConfigFlag}
                      onChange={(e) => setDraft({ ...draft, systemConfigFlag: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    />
                  ) : (
                    <span className={`text-xs ${r.systemConfigFlag ? "text-green-600" : "text-gray-400"}`}>
                      {r.systemConfigFlag ? "Yes" : "—"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editing === r.id ? (
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => save(r.id)} disabled={saving}
                        className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={() => { setEditing(null); setDraft({}); }}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditing(r.id); setDraft({}); }}
                      className="px-2 py-1 text-xs text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded">
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
                  No staff found with status &quot;{statusFilter}&quot;
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    {showAddForm && (
      <AddStaffForm
        onClose={() => setShowAddForm(false)}
        onSuccess={() => { setShowAddForm(false); mutate(); }}
      />
    )}
    </>
  );
}

// ─── Add Staff Form (slide-over) ───────────────────────────────────────────

interface LookupOption { Id: string; DeptCode?: string; DeptName?: string; RoleCode?: string; RoleName?: string }

function AddStaffForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: lookups } = useSWR<{ departments: LookupOption[]; roles: LookupOption[] }>("/api/lookups", apiFetcher);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    staffCode: "",
    name: "",
    email: "",
    roleId: "",
    deptId: "",
    subTeam: "",
    productivityFactor: "0.8",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staffCode || !form.name || !form.email || !form.roleId || !form.deptId) {
      setError("Staff code, name, email, role, and department are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        staffCode: form.staffCode,
        name: form.name,
        email: form.email,
        roleId: form.roleId,
        deptId: form.deptId,
        productivityFactor: parseFloat(form.productivityFactor),
      };
      if (form.subTeam) body.subTeam = form.subTeam;

      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const departments = lookups?.departments ?? [];
  const roles = lookups?.roles ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col animate-slide-in">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Staff Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Staff Code <span className="text-red-500">*</span></span>
              <input type="text" value={form.staffCode}
                onChange={(e) => setForm((f) => ({ ...f, staffCode: e.target.value }))}
                placeholder="e.g. CSI-001" className="mt-1 input-field" />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></span>
              <input type="text" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ahmad Zaki bin Ismail" className="mt-1 input-field" />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></span>
              <input type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="e.g. ahmad.zaki@10cs.my" className="mt-1 input-field" />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Department <span className="text-red-500">*</span></span>
              <select value={form.deptId}
                onChange={(e) => setForm((f) => ({ ...f, deptId: e.target.value }))}
                className="mt-1 input-field">
                <option value="">Select department...</option>
                {departments.map((d: LookupOption) => (
                  <option key={d.Id} value={d.Id}>{d.DeptCode} — {d.DeptName}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></span>
              <select value={form.roleId}
                onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                className="mt-1 input-field">
                <option value="">Select role...</option>
                {roles.map((r: LookupOption) => (
                  <option key={r.Id} value={r.Id}>{r.RoleName}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Sub-Team</span>
                <select value={form.subTeam}
                  onChange={(e) => setForm((f) => ({ ...f, subTeam: e.target.value }))}
                  className="mt-1 input-field">
                  <option value="">None</option>
                  <option value="A">Pod A</option>
                  <option value="B">Pod B</option>
                  <option value="C">Pod C</option>
                  <option value="D">Pod D</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Productivity Factor</span>
                <input type="number" step="0.1" min="0.1" max="1.0"
                  value={form.productivityFactor}
                  onChange={(e) => setForm((f) => ({ ...f, productivityFactor: e.target.value }))}
                  className="mt-1 input-field" />
                <span className="text-xs text-gray-400 mt-0.5 block">
                  Daily hours = 8 × {form.productivityFactor} = {(8 * parseFloat(form.productivityFactor || "0")).toFixed(1)}h
                </span>
              </label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? "Creating..." : "Create Staff"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
