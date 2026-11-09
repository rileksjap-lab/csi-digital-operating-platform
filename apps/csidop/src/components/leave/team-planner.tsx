"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import { btnCls, fmtRange, PART_LABEL, STATUS_LABEL } from "@/components/leave/shared";
import type { DayPart, LeaveStatus } from "@/lib/leave/rules";

interface PlannerData {
  staff: { id: string; name: string; subTeam: string | null }[];
  leaves: { id: string; staffId: string; startDate: string; endDate: string; dayPart: DayPart; status: LeaveStatus; reason: string | null; typeCode: string; typeName: string; colour: string }[];
  holidays: { date: string; name: string }[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function TeamPlanner() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data } = useSWR<PlannerData>(`/api/leave/planner?year=${year}&month=${month}`, apiFetcher);

  const days = useMemo(() => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => {
    const iso = `${year}-${pad(month)}-${pad(i + 1)}`;
    return { n: i + 1, iso, dow: new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay() };
  }), [year, month]);

  const holidays = useMemo(() => new Map((data?.holidays ?? []).map((h) => [h.date, h.name])), [data]);
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const move = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth() + 1);
  };

  const leaveOn = (staffId: string, iso: string) => data?.leaves.find((l) => l.staffId === staffId && l.startDate <= iso && iso <= l.endDate);
  const legend = useMemo(() => {
    const seen = new Map<string, { name: string; colour: string }>();
    for (const l of data?.leaves ?? []) seen.set(l.typeCode, { name: l.typeName, colour: l.colour });
    return [...seen.values()];
  }, [data]);
  const awayToday = useMemo(() => (data?.staff ?? []).filter((s) => leaveOn(s.id, today)?.status === "Approved").map((s) => s.name), [data, today]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className={btnCls} onClick={() => move(-1)} aria-label="Previous month">←</button>
          <span className="w-40 text-center text-sm font-semibold text-gray-800">{MONTHS[month - 1]} {year}</span>
          <button className={btnCls} onClick={() => move(1)} aria-label="Next month">→</button>
          <button className={btnCls} onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}>Today</button>
        </div>
        {year === now.getFullYear() && month === now.getMonth() + 1 && (
          <p className="text-sm text-gray-600">{awayToday.length === 0 ? "Nobody is on approved leave today." : <>Away today: <span className="font-medium">{awayToday.join(", ")}</span></>}</p>
        )}
      </div>

      {!data ? <p className="text-sm text-gray-400">Loading…</p> : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[140px] bg-gray-50 px-3 py-2 text-left font-medium text-gray-500">Team member</th>
                {days.map((d) => {
                  const off = d.dow === 0 || d.dow === 6 || holidays.has(d.iso);
                  return (
                    <th key={d.iso} title={holidays.get(d.iso)} className={`w-[26px] min-w-[26px] border-l border-gray-100 py-1 text-center font-normal ${off ? "bg-gray-100 text-gray-400" : "bg-gray-50 text-gray-500"} ${d.iso === today ? "ring-1 ring-inset ring-primary-500" : ""}`}>
                      <div>{DOW[d.dow]}</div><div className="font-medium">{d.n}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 text-gray-800">{s.name}</td>
                  {days.map((d) => {
                    const l = leaveOn(s.id, d.iso);
                    const off = d.dow === 0 || d.dow === 6 || holidays.has(d.iso);
                    const pending = l && l.status !== "Approved";
                    const half = l && l.dayPart !== "Full";
                    return (
                      <td key={d.iso} className={`h-7 border-l border-gray-100 p-0 ${off ? "bg-gray-50" : ""}`}
                        title={l ? `${s.name}: ${l.typeName}, ${fmtRange(l.startDate, l.endDate, l.dayPart)}${PART_LABEL[l.dayPart] ? "" : ""} · ${STATUS_LABEL[l.status]}${l.reason ? ` · ${l.reason}` : ""}` : holidays.get(d.iso)}>
                        {l && !off && (
                          <div className="h-full w-full" style={{
                            background: pending ? `repeating-linear-gradient(45deg, ${l.colour}55, ${l.colour}55 4px, #ffffff 4px, #ffffff 8px)` : l.colour,
                            opacity: half ? 0.55 : 1,
                          }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        {legend.map((l) => <span key={l.name} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: l.colour }} />{l.name}</span>)}
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border border-gray-300" style={{ background: "repeating-linear-gradient(45deg,#9ca3af55,#9ca3af55 3px,#fff 3px,#fff 6px)" }} />Waiting for approval</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-gray-200" />Weekend / public holiday</span>
      </div>
      {data && data.holidays.length > 0 && (
        <p className="text-xs text-gray-500">Public holidays: {data.holidays.map((h) => `${h.date.slice(8)} ${h.name}`).join(" · ")}</p>
      )}
    </div>
  );
}
