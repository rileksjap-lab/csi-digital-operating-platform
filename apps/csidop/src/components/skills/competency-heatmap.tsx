"use client";

import { useMemo, useState } from "react";

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

const LEVEL_BG: Record<string, string> = {
  Beginner: "bg-gray-200 text-gray-700",
  Intermediate: "bg-blue-200 text-blue-800",
  Advanced: "bg-green-300 text-green-900",
  Expert: "bg-purple-400 text-white",
};

interface CellDetail {
  level: string;
  skills: { skillName: string; level: string }[];
}

interface Props {
  rows: StaffSkillRow[];
}

export default function CompetencyHeatmap({ rows }: Props) {
  const [podFilter, setPodFilter] = useState("");
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  const pods = useMemo(
    () => Array.from(new Set(rows.map((r) => r.subTeam ?? "Unassigned"))).sort(),
    [rows]
  );

  const filteredRows = useMemo(
    () => (podFilter ? rows.filter((r) => (r.subTeam ?? "Unassigned") === podFilter) : rows),
    [rows, podFilter]
  );

  const { staffList, matrix } = useMemo(() => {
    const staffMap = new Map<string, { staffId: string; staffName: string; deptCode: string; subTeam: string | null }>();
    const m = new Map<string, Map<string, CellDetail>>();
    for (const r of filteredRows) {
      if (!staffMap.has(r.staffId)) {
        staffMap.set(r.staffId, { staffId: r.staffId, staffName: r.staffName, deptCode: r.deptCode, subTeam: r.subTeam });
      }
      if (!m.has(r.staffId)) m.set(r.staffId, new Map());
      const domainMap = m.get(r.staffId)!;
      const existing = domainMap.get(r.technologyDomain);
      if (!existing) {
        domainMap.set(r.technologyDomain, { level: r.competencyLevel, skills: [{ skillName: r.skillName, level: r.competencyLevel }] });
      } else {
        existing.skills.push({ skillName: r.skillName, level: r.competencyLevel });
        if (LEVEL_RANK[r.competencyLevel] > LEVEL_RANK[existing.level]) existing.level = r.competencyLevel;
      }
    }
    return {
      staffList: Array.from(staffMap.values()).sort((a, b) => a.staffName.localeCompare(b.staffName)),
      matrix: m,
    };
  }, [filteredRows]);

  const expanded = useMemo(() => {
    if (!expandedCell) return null;
    const [staffId, domain] = expandedCell.split("|");
    const cell = matrix.get(staffId)?.get(domain);
    const staff = staffList.find((s) => s.staffId === staffId);
    if (!cell || !staff) return null;
    return { staff, domain, cell };
  }, [expandedCell, matrix, staffList]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={podFilter}
          onChange={(e) => setPodFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <option value="">All Pods</option>
          {pods.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{staffList.length} staff</span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-gray-500">
          {Object.entries(LEVEL_BG).map(([level, cls]) => (
            <span key={level} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded-sm ${cls.split(" ")[0]}`} />
              {level}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Staff</th>
              {DOMAINS.map((d) => (
                <th key={d} className="whitespace-nowrap px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staffList.map((s) => (
              <tr key={s.staffId}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-xs font-medium text-gray-800">
                  {s.staffName} <span className="text-gray-400">({s.subTeam ?? "—"})</span>
                </td>
                {DOMAINS.map((d) => {
                  const cell = matrix.get(s.staffId)?.get(d);
                  const key = `${s.staffId}|${d}`;
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      {cell ? (
                        <button
                          onClick={() => setExpandedCell(expandedCell === key ? null : key)}
                          className={`w-full rounded px-2 py-1.5 text-[10px] font-semibold transition-transform hover:scale-105 ${LEVEL_BG[cell.level]}`}
                          title={cell.skills.map((sk) => `${sk.skillName}: ${sk.level}`).join(", ")}
                        >
                          {cell.level.slice(0, 3)}
                        </button>
                      ) : (
                        <span className="block px-2 py-1.5 text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {staffList.length === 0 && (
              <tr>
                <td colSpan={DOMAINS.length + 1} className="px-4 py-12 text-center text-gray-400">
                  No assessments found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expanded && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
          <p className="font-medium text-gray-800">{expanded.staff.staffName} · {expanded.domain}</p>
          <ul className="mt-1.5 space-y-0.5 text-gray-600">
            {expanded.cell.skills.map((sk, i) => (
              <li key={i}>
                {sk.skillName}: <span className="font-medium text-gray-800">{sk.level}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
