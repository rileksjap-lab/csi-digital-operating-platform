"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SkillRow {
  id: string;
  skillName: string;
  technologyDomain: string;
}

interface StaffOption {
  Id: string;
  Name: string;
  StaffCode: string;
}

interface StaffSkillRow {
  staffId: string;
  staffName: string;
  staffCode: string;
  deptCode: string;
  subTeam: string | null;
  skillId: string;
  skillName: string;
  technologyDomain: string;
  competencyLevel: string;
  lastAssessmentDate: string;
  assessedByName: string;
}

interface CertificationRow {
  id: string;
  staffId: string;
  staffName: string;
  staffCode: string;
  deptCode: string;
  certificationName: string;
  vendor: string | null;
  certificationLevel: string | null;
  issueDate: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  status: string;
  evidenceFile: string | null;
}

interface TrainingPlanRow {
  id: string;
  staffId: string;
  staffName: string;
  skillId: string | null;
  skillName: string | null;
  certificationId: string | null;
  certificationName: string | null;
  plannedActivity: string;
  targetDate: string | null;
  status: string;
  createdAt: string;
}

type Tab = "competency" | "certifications" | "training";

const TABS: { key: Tab; label: string }[] = [
  { key: "competency", label: "Skills & Competency" },
  { key: "certifications", label: "Certifications" },
  { key: "training", label: "Training Plans" },
];

const DOMAINS = [
  "Cloud",
  "Cyber Security",
  "Data Centre",
  "Network",
  "Enterprise Architecture",
  "AI / HPC",
  "BIM",
  "Consultancy",
];

const COMPETENCY_LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"];

const COMPETENCY_COLORS: Record<string, string> = {
  Beginner: "bg-gray-100 text-gray-700",
  Intermediate: "bg-blue-100 text-blue-700",
  Advanced: "bg-green-100 text-green-700",
  Expert: "bg-purple-100 text-purple-700",
};

const CERT_STATUS_COLORS: Record<string, string> = {
  Unverified: "bg-yellow-100 text-yellow-700",
  Verified: "bg-green-100 text-green-700",
  Expired: "bg-red-100 text-red-700",
};

const TRAINING_STATUS_COLORS: Record<string, string> = {
  Planned: "bg-gray-100 text-gray-700",
  InProgress: "bg-blue-100 text-blue-700",
  Completed: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

export default function SkillsPage() {
  const [tab, setTab] = useState<Tab>("competency");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">
        Skills & Certifications
      </h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "competency" && <CompetencyTab />}
      {tab === "certifications" && <CertificationsTab />}
      {tab === "training" && <TrainingTab />}
    </div>
  );
}

// ─── Competency Tab ─────────────────────────────────────────────────────────

function CompetencyTab() {
  const [domainFilter, setDomainFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const url = domainFilter
    ? `/api/skills/assessments?domain=${encodeURIComponent(domainFilter)}`
    : "/api/skills/assessments";

  const { data, error, isLoading } = useSWR<StaffSkillRow[]>(url, apiFetcher);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return null;

  // KPI summaries
  const uniqueStaff = new Set(data.map((r) => r.staffId)).size;
  const uniqueDomains = new Set(data.map((r) => r.technologyDomain)).size;
  const expertCount = data.filter((r) => r.competencyLevel === "Expert").length;
  const beginnerCount = data.filter((r) => r.competencyLevel === "Beginner").length;

  // Group by staff for heatmap
  const byStaff = new Map<string, StaffSkillRow[]>();
  for (const row of data) {
    const existing = byStaff.get(row.staffId) ?? [];
    existing.push(row);
    byStaff.set(row.staffId, existing);
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Assessments" value={data.length} />
        <KpiCard label="Staff Assessed" value={uniqueStaff} />
        <KpiCard label="Domains Covered" value={`${uniqueDomains}/8`} sub={uniqueDomains < 8 ? "Gaps exist" : "Full coverage"} />
        <KpiCard label="Expert-Level" value={expertCount} sub={`${beginnerCount} at Beginner`} />
      </div>

      {/* Filters + Add button */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <option value="">All Domains</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {data.length} assessment{data.length !== 1 ? "s" : ""} across{" "}
          {byStaff.size} staff
        </span>
        <div className="ml-auto">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <PlusIcon /> Add Assessment
          </button>
        </div>
      </div>

      {/* Assessment table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Staff</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Dept</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Skill</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Domain</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Level</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Assessed</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Assessed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No assessments found
                  </td>
                </tr>
              )}
              {data.map((r) => (
                <tr key={`${r.staffId}-${r.skillId}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{r.staffName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.deptCode}</td>
                  <td className="px-4 py-3 text-gray-700">{r.skillName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.technologyDomain}</td>
                  <td className="px-4 py-3">
                    <Badge className={COMPETENCY_COLORS[r.competencyLevel] ?? ""}>{r.competencyLevel}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-500">{r.lastAssessmentDate}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.assessedByName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Assessment slide-over */}
      {showForm && (
        <AssessmentForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            mutate(url);
          }}
        />
      )}
    </div>
  );
}

// ─── Add Assessment Form ────────────────────────────────────────────────────

function AssessmentForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: staffList } = useSWR<StaffOption[]>("/api/staff", apiFetcher);
  const { data: skillList } = useSWR<SkillRow[]>("/api/skills", apiFetcher);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    staffId: "",
    skillId: "",
    competencyLevel: "",
    lastAssessmentDate: new Date().toISOString().slice(0, 10),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staffId || !form.skillId || !form.competencyLevel) {
      setError("All fields are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/skills/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error ${res.status}`);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideOver title="Add Skill Assessment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Staff Member">
          <select
            value={form.staffId}
            onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
            className="input-field"
          >
            <option value="">Select staff...</option>
            {(staffList ?? []).map((s) => (
              <option key={s.Id} value={s.Id}>{s.Name} ({s.StaffCode})</option>
            ))}
          </select>
        </Field>

        <Field label="Skill">
          <select
            value={form.skillId}
            onChange={(e) => setForm((f) => ({ ...f, skillId: e.target.value }))}
            className="input-field"
          >
            <option value="">Select skill...</option>
            {(skillList ?? []).map((sk) => (
              <option key={sk.id} value={sk.id}>{sk.skillName} ({sk.technologyDomain})</option>
            ))}
          </select>
        </Field>

        <Field label="Competency Level">
          <select
            value={form.competencyLevel}
            onChange={(e) => setForm((f) => ({ ...f, competencyLevel: e.target.value }))}
            className="input-field"
          >
            <option value="">Select level...</option>
            {COMPETENCY_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </Field>

        <Field label="Assessment Date">
          <input
            type="date"
            value={form.lastAssessmentDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setForm((f) => ({ ...f, lastAssessmentDate: e.target.value }))}
            className="input-field"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving..." : "Save Assessment"}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}

// ─── Certifications Tab ─────────────────────────────────────────────────────

function CertificationsTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (expiryFilter) params.set("expiringWithinDays", expiryFilter);
  const qs = params.toString();
  const url = `/api/skills/certifications${qs ? `?${qs}` : ""}`;

  const { data, error, isLoading } = useSWR<CertificationRow[]>(url, apiFetcher);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return null;

  // KPI summaries
  const verifiedCount = data.filter((c) => c.status === "Verified").length;
  const expiredCount = data.filter((c) => c.status === "Expired").length;
  const expiring90 = data.filter((c) => c.daysUntilExpiry !== null && c.daysUntilExpiry >= 0 && c.daysUntilExpiry <= 90).length;
  const unverifiedCount = data.filter((c) => c.status === "Unverified").length;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Certifications" value={data.length} />
        <KpiCard label="Verified" value={verifiedCount} color="text-green-600" />
        <KpiCard label="Expiring ≤ 90 Days" value={expiring90} color={expiring90 > 0 ? "text-orange-600" : "text-green-600"} />
        <KpiCard label="Expired" value={expiredCount} color={expiredCount > 0 ? "text-red-600" : "text-green-600"} />
      </div>

      {/* Filters + Add button */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter pills */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {[
            { value: "", label: "All" },
            { value: "Verified", label: "Verified" },
            { value: "Unverified", label: "Unverified" },
            { value: "Expired", label: "Expired" },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-primary-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          value={expiryFilter}
          onChange={(e) => setExpiryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <option value="">All Expiry</option>
          <option value="30">Expiring in 30 days</option>
          <option value="90">Expiring in 90 days</option>
          <option value="180">Expiring in 180 days</option>
        </select>

        <span className="text-xs text-gray-400">
          {data.length} certification{data.length !== 1 ? "s" : ""}
        </span>

        <div className="ml-auto">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <PlusIcon /> Add Certification
          </button>
        </div>
      </div>

      {/* Certifications table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Staff</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Certification</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Level</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Issued</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Expiry</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No certifications found
                  </td>
                </tr>
              )}
              {data.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.staffName}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{c.certificationName}</td>
                  <td className="px-4 py-3">
                    {c.vendor ? (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{c.vendor}</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.certificationLevel ?? "—"}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-500">{c.issueDate}</td>
                  <td className="px-4 py-3">
                    <ExpiryChip expiryDate={c.expiryDate} daysUntilExpiry={c.daysUntilExpiry} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={CERT_STATUS_COLORS[c.status] ?? ""}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "Unverified" && (
                      <button
                        disabled={updating === c.id}
                        onClick={async () => {
                          setUpdating(c.id);
                          try {
                            const res = await fetch(`/api/skills/certifications/${c.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "Verified" }),
                            });
                            if (res.ok) mutate(url);
                          } finally {
                            setUpdating(null);
                          }
                        }}
                        className="text-xs font-medium text-primary-600 hover:text-primary-800 disabled:opacity-50"
                      >
                        {updating === c.id ? "..." : "Verify"}
                      </button>
                    )}
                    {c.status === "Expired" && (
                      <button
                        disabled={updating === c.id}
                        onClick={async () => {
                          setUpdating(c.id);
                          try {
                            const res = await fetch(`/api/skills/certifications/${c.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "Verified" }),
                            });
                            if (res.ok) mutate(url);
                          } finally {
                            setUpdating(null);
                          }
                        }}
                        className="text-xs font-medium text-green-600 hover:text-green-800 disabled:opacity-50"
                      >
                        {updating === c.id ? "..." : "Renew"}
                      </button>
                    )}
                    {c.status === "Verified" && (
                      <span className="text-xs text-gray-400">Verified</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Certification slide-over */}
      {showForm && (
        <CertificationForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            mutate(url);
          }}
        />
      )}
    </div>
  );
}

// ─── Add Certification Form ─────────────────────────────────────────────────

function CertificationForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    certificationName: "",
    vendor: "",
    certificationLevel: "",
    issueDate: "",
    expiryDate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.certificationName || !form.issueDate) {
      setError("Certification name and issue date are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, string> = {
        certificationName: form.certificationName,
        issueDate: form.issueDate,
      };
      if (form.vendor) body.vendor = form.vendor;
      if (form.certificationLevel) body.certificationLevel = form.certificationLevel;
      if (form.expiryDate) body.expiryDate = form.expiryDate;

      const res = await fetch("/api/skills/certifications", {
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

  return (
    <SlideOver title="Add Certification" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Certification Name" required>
          <input
            type="text"
            value={form.certificationName}
            onChange={(e) => setForm((f) => ({ ...f, certificationName: e.target.value }))}
            placeholder="e.g. AWS Solutions Architect"
            className="input-field"
          />
        </Field>

        <Field label="Vendor">
          <input
            type="text"
            value={form.vendor}
            onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
            placeholder="e.g. Amazon, Cisco, Microsoft"
            className="input-field"
          />
        </Field>

        <Field label="Level">
          <input
            type="text"
            value={form.certificationLevel}
            onChange={(e) => setForm((f) => ({ ...f, certificationLevel: e.target.value }))}
            placeholder="e.g. Associate, Professional"
            className="input-field"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Issue Date" required>
            <input
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
              className="input-field"
            />
          </Field>
          <Field label="Expiry Date">
            <input
              type="date"
              value={form.expiryDate}
              min={form.issueDate || undefined}
              onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
              className="input-field"
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving..." : "Save Certification"}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}

// ─── Training Tab ───────────────────────────────────────────────────────────

function TrainingTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  const url = statusFilter
    ? `/api/skills/training?status=${statusFilter}`
    : "/api/skills/training";

  const { data, error, isLoading } = useSWR<TrainingPlanRow[]>(url, apiFetcher);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={error.message} />;
  if (!data) return null;

  // KPI summaries
  const plannedCount = data.filter((t) => t.status === "Planned").length;
  const inProgressCount = data.filter((t) => t.status === "InProgress").length;
  const completedCount = data.filter((t) => t.status === "Completed").length;
  const overdueCount = data.filter(
    (t) => t.targetDate && t.status !== "Completed" && t.status !== "Cancelled" && new Date(t.targetDate) < new Date()
  ).length;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Plans" value={data.length} />
        <KpiCard label="In Progress" value={inProgressCount} color="text-blue-600" />
        <KpiCard label="Completed" value={completedCount} color="text-green-600" />
        <KpiCard label="Overdue" value={overdueCount} color={overdueCount > 0 ? "text-red-600" : "text-green-600"} />
      </div>

      {/* Filters + Add button */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter pills */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {[
            { value: "", label: "All" },
            { value: "Planned", label: "Planned" },
            { value: "InProgress", label: "In Progress" },
            { value: "Completed", label: "Completed" },
            { value: "Cancelled", label: "Cancelled" },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s.value
                  ? "bg-primary-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-400">
          {data.length} plan{data.length !== 1 ? "s" : ""}
        </span>

        <div className="ml-auto">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <PlusIcon /> Add Training Plan
          </button>
        </div>
      </div>

      {/* Training table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Staff</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Activity</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Linked To</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Target Date</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    No training plans found
                  </td>
                </tr>
              )}
              {data.map((tp) => (
                <tr key={tp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{tp.staffName}</td>
                  <td className="px-4 py-3 text-gray-700">{tp.plannedActivity}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {tp.skillName
                      ? `Skill: ${tp.skillName}`
                      : tp.certificationName
                      ? `Cert: ${tp.certificationName}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-500">
                    {tp.targetDate ? (
                      <span className={
                        tp.status !== "Completed" && tp.status !== "Cancelled" && new Date(tp.targetDate) < new Date()
                          ? "text-red-600 font-medium"
                          : ""
                      }>
                        {tp.targetDate}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={TRAINING_STATUS_COLORS[tp.status] ?? ""}>{tp.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Training Plan slide-over */}
      {showForm && (
        <TrainingForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            mutate(url);
          }}
        />
      )}
    </div>
  );
}

// ─── Add Training Plan Form ─────────────────────────────────────────────────

function TrainingForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { data: staffList } = useSWR<StaffOption[]>("/api/staff", apiFetcher);
  const { data: skillList } = useSWR<SkillRow[]>("/api/skills", apiFetcher);
  const { data: certList } = useSWR<CertificationRow[]>("/api/skills/certifications", apiFetcher);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [linkType, setLinkType] = useState<"skill" | "certification">("skill");
  const [form, setForm] = useState({
    staffId: "",
    skillId: "",
    certificationId: "",
    plannedActivity: "",
    targetDate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staffId || !form.plannedActivity) {
      setError("Staff and activity are required");
      return;
    }
    const linkedId = linkType === "skill" ? form.skillId : form.certificationId;
    if (!linkedId) {
      setError(`Please select a ${linkType}`);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, string> = {
        staffId: form.staffId,
        plannedActivity: form.plannedActivity,
      };
      if (linkType === "skill") body.skillId = form.skillId;
      else body.certificationId = form.certificationId;
      if (form.targetDate) body.targetDate = form.targetDate;

      const res = await fetch("/api/skills/training", {
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

  return (
    <SlideOver title="Add Training Plan" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Staff Member" required>
          <select
            value={form.staffId}
            onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
            className="input-field"
          >
            <option value="">Select staff...</option>
            {(staffList ?? []).map((s) => (
              <option key={s.Id} value={s.Id}>{s.Name} ({s.StaffCode})</option>
            ))}
          </select>
        </Field>

        <Field label="Link To" required>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => { setLinkType("skill"); setForm((f) => ({ ...f, certificationId: "" })); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                linkType === "skill" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              Skill
            </button>
            <button
              type="button"
              onClick={() => { setLinkType("certification"); setForm((f) => ({ ...f, skillId: "" })); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                linkType === "certification" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              Certification
            </button>
          </div>
          {linkType === "skill" ? (
            <select
              value={form.skillId}
              onChange={(e) => setForm((f) => ({ ...f, skillId: e.target.value }))}
              className="input-field"
            >
              <option value="">Select skill...</option>
              {(skillList ?? []).map((sk) => (
                <option key={sk.id} value={sk.id}>{sk.skillName} ({sk.technologyDomain})</option>
              ))}
            </select>
          ) : (
            <select
              value={form.certificationId}
              onChange={(e) => setForm((f) => ({ ...f, certificationId: e.target.value }))}
              className="input-field"
            >
              <option value="">Select certification...</option>
              {(certList ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.certificationName} — {c.staffName}</option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Planned Activity" required>
          <input
            type="text"
            value={form.plannedActivity}
            onChange={(e) => setForm((f) => ({ ...f, plannedActivity: e.target.value }))}
            placeholder="e.g. Complete AWS Associate certification course"
            className="input-field"
          />
        </Field>

        <Field label="Target Date">
          <input
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
            className="input-field"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Saving..." : "Save Training Plan"}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}

// ─── Shared components ──────────────────────────────────────────────────────

function SlideOver({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col animate-slide-in">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color = "text-gray-900",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ExpiryChip({
  expiryDate,
  daysUntilExpiry,
}: {
  expiryDate: string | null;
  daysUntilExpiry: number | null;
}) {
  if (!expiryDate) return <span className="text-xs text-gray-400">No expiry</span>;
  if (daysUntilExpiry === null) return <span className="text-xs text-gray-500">{expiryDate}</span>;

  if (daysUntilExpiry < 0) {
    return <Badge className="bg-red-100 text-red-700">Expired {Math.abs(daysUntilExpiry)}d ago</Badge>;
  }
  if (daysUntilExpiry <= 30) {
    return <Badge className="bg-red-100 text-red-700">{daysUntilExpiry}d left</Badge>;
  }
  if (daysUntilExpiry <= 90) {
    return <Badge className="bg-yellow-100 text-yellow-700">{daysUntilExpiry}d left</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700">{daysUntilExpiry}d left</Badge>;
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
    </div>
  );
}

function ErrorBox({ message }: { message?: string }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message ?? "Failed to load data"}
    </div>
  );
}
