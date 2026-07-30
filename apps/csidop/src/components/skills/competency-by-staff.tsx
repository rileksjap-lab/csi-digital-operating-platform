"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

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

interface SkillHistoryEntry {
  id: string;
  skillId: string | null;
  skillName: string | null;
  technologyDomain: string | null;
  action: string;
  previousLevel: string | null;
  newLevel: string | null;
  performedByName: string;
  performedAt: string;
}

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

const LEVEL_RANK: Record<string, number> = { Beginner: 1, Intermediate: 2, Advanced: 3, Expert: 4 };
const LEVEL_NAMES = ["", "Beginner", "Intermediate", "Advanced", "Expert"];
const LEVEL_BAR = ["", "bg-gray-400", "bg-blue-400", "bg-green-400", "bg-purple-500"];

interface Props {
  rows: StaffSkillRow[];
}

export default function CompetencyByStaff({ rows }: Props) {
  const staffList = useMemo(() => {
    const map = new Map<string, { staffId: string; staffName: string; deptCode: string }>();
    for (const r of rows) {
      if (!map.has(r.staffId)) map.set(r.staffId, { staffId: r.staffId, staffName: r.staffName, deptCode: r.deptCode });
    }
    return Array.from(map.values()).sort((a, b) => a.staffName.localeCompare(b.staffName));
  }, [rows]);

  const [selectedStaffId, setSelectedStaffId] = useState("");

  useEffect(() => {
    if (!selectedStaffId && staffList.length > 0) setSelectedStaffId(staffList[0].staffId);
  }, [staffList, selectedStaffId]);

  const staffRows = useMemo(() => rows.filter((r) => r.staffId === selectedStaffId), [rows, selectedStaffId]);

  const domainLevels = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of staffRows) {
      const rank = LEVEL_RANK[r.competencyLevel] ?? 0;
      if (!m.has(r.technologyDomain) || rank > m.get(r.technologyDomain)!) m.set(r.technologyDomain, rank);
    }
    return DOMAINS.map((d) => ({ domain: d, rank: m.get(d) ?? 0 }));
  }, [staffRows]);

  const { data: history, isLoading: historyLoading } = useSWR<SkillHistoryEntry[]>(
    selectedStaffId ? `/api/skills/history?staffId=${selectedStaffId}` : null,
    apiFetcher
  );

  if (staffList.length === 0) {
    return <p className="px-4 py-12 text-center text-sm text-gray-400">No assessments found</p>;
  }

  return (
    <div className="space-y-4">
      <select
        value={selectedStaffId}
        onChange={(e) => setSelectedStaffId(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
      >
        {staffList.map((s) => (
          <option key={s.staffId} value={s.staffId}>{s.staffName} ({s.deptCode})</option>
        ))}
      </select>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Competency by Domain</h3>
        <div className="space-y-2.5">
          {domainLevels.map(({ domain, rank }) => (
            <div key={domain} className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-xs text-gray-600">{domain}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                {rank > 0 && (
                  <div className={`h-full rounded-full ${LEVEL_BAR[rank]}`} style={{ width: `${(rank / 4) * 100}%` }} />
                )}
              </div>
              <span className="w-24 shrink-0 text-right text-[11px] text-gray-500">{rank > 0 ? LEVEL_NAMES[rank] : "Not assessed"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assessment History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Skill</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Previous</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">New</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Assessor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {historyLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!historyLoading && (history ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No history yet</td></tr>
              )}
              {(history ?? []).map((h) => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs tabular-nums text-gray-500">{h.performedAt.slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{h.skillName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{h.previousLevel ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-gray-800">{h.newLevel ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{h.performedByName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
