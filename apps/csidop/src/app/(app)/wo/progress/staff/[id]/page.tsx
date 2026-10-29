"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import WoStatusBadge from "@/components/wo/wo-status-badge";
import WoPriorityBadge from "@/components/wo/wo-priority-badge";

interface Task {
  id: string;
  taskNo: number;
  description: string;
  ownerName: string | null;
  isMine: boolean;
  progress: number;
  plannedEnd: string | null;
  dateCompleted: string | null;
}

interface WoItem {
  id: string;
  csiWoNo: string;
  title: string;
  typeName: string;
  priority: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  closedAt: string | null;
  assignedToName: string | null;
  progress: number;
  myHours: number;
  totalHours: number;
  involvement: string[];
  tasks: Task[];
}

interface EffortItem {
  logDate: string;
  hours: number;
  notes: string | null;
  woId: string;
  csiWoNo: string;
  title: string;
}

interface PersonData {
  person: { id: string; name: string; subTeam: string | null; roleName: string };
  period: string;
  summary: {
    active: number;
    overdue: number;
    dueThisWeek: number;
    closed: number;
    onTimePct: number | null;
    avgDays: number | null;
    effortHours: number;
  };
  current: WoItem[];
  history: WoItem[];
  effort: EffortItem[];
}

const PERIODS = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

const today = () => new Date().toISOString().slice(0, 10);
const day = (d: string | null) => (d ? d.slice(0, 10) : "—");

function Stat({ label, value, sub, tone = "text-gray-900" }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Bar({ value, color = "bg-primary-500" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-100">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function WoCard({ wo, history }: { wo: WoItem; history?: boolean }) {
  const overdue = !history && (wo.status === "Open" || wo.status === "InProgress") && !!wo.dueDate && wo.dueDate < today();
  const onTime = history && wo.status === "Closed" && wo.closedAt ? !wo.dueDate || wo.closedAt.slice(0, 10) <= wo.dueDate : null;
  return (
    <details className="group rounded-lg border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-gray-50">
        <span className="text-xs text-gray-400 transition-transform group-open:rotate-90">▶</span>
        <div className="min-w-[14rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-gray-400">{wo.csiWoNo}</span>
            <WoStatusBadge status={wo.status === "Cancelled" ? "OnHold" : wo.status} />
            {wo.status === "Cancelled" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Cancelled</span>}
            <WoPriorityBadge priority={wo.priority} />
            <span className="text-xs text-gray-500">{wo.typeName}</span>
          </div>
          <p className="mt-0.5 text-sm font-medium text-gray-800">{wo.title}</p>
          <p className="text-xs text-gray-500">
            {wo.involvement.join(" + ")}
            {wo.assignedToName && !wo.involvement.includes("Assignee") ? ` · assigned to ${wo.assignedToName}` : ""}
          </p>
        </div>
        <div className="w-36">
          <div className="flex justify-between text-xs text-gray-500"><span>Progress</span><span className="font-medium text-gray-700">{wo.status === "Closed" ? "Done" : `${wo.progress}%`}</span></div>
          <Bar value={wo.status === "Closed" ? 100 : wo.progress} color={wo.status === "Closed" ? "bg-green-500" : overdue ? "bg-red-400" : "bg-primary-500"} />
        </div>
        <div className="w-44 text-right text-xs">
          {history ? (
            <>
              <p className="whitespace-nowrap text-gray-600">{wo.status === "Cancelled" ? "Cancelled" : "Closed"}{wo.closedAt ? ` ${day(wo.closedAt)}` : ""}</p>
              {onTime !== null && <p className={onTime ? "text-green-700" : "text-red-600"}><span className="whitespace-nowrap">{onTime ? "On time" : "Late"}{wo.dueDate ? ` (due ${day(wo.dueDate)})` : ""}</span></p>}
            </>
          ) : (
            <>
              <p className={overdue ? "font-semibold text-red-600" : "text-gray-600"}>{wo.dueDate ? `Due ${day(wo.dueDate)}` : "No due date"}</p>
              {overdue && <p className="text-red-600">Overdue</p>}
            </>
          )}
        </div>
        <div className="w-20 text-right text-xs text-gray-500">{wo.myHours.toFixed(1)} h</div>
      </summary>

      <div className="border-t border-gray-100 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>Created {day(wo.createdAt)} · total effort on this work order {wo.totalHours.toFixed(1)} h</span>
          <Link href={`/wo/${wo.id}`} className="link-action">Open work order →</Link>
        </div>
        {wo.tasks.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks on this work order.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="py-1 pr-2">#</th><th className="py-1 pr-2">Task</th><th className="py-1 pr-2">Owner</th>
                <th className="py-1 pr-2">Planned end</th><th className="w-44 py-1">Progress</th>
              </tr>
            </thead>
            <tbody>
              {wo.tasks.map((t) => (
                <tr key={t.id} className={`border-t border-gray-50 ${t.isMine ? "bg-amber-50/60" : ""}`}>
                  <td className="py-1.5 pr-2 text-gray-400">{t.taskNo}</td>
                  <td className="py-1.5 pr-2 text-gray-800">{t.description}</td>
                  <td className="py-1.5 pr-2 text-gray-600">{t.ownerName ?? "—"}{t.isMine && <span className="ml-1 text-xs text-amber-700">(this person)</span>}</td>
                  <td className="py-1.5 pr-2 text-gray-600">{day(t.plannedEnd)}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Bar value={t.progress} color={t.progress >= 100 ? "bg-green-500" : "bg-primary-500"} /></div>
                      <span className="w-9 text-right text-xs text-gray-600">{t.progress}%</span>
                    </div>
                    {t.dateCompleted && <p className="text-xs text-green-700">Done {day(t.dateCompleted)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}

export default function StaffProgressPage() {
  const { id } = useParams<{ id: string }>();
  const [period, setPeriod] = useState("12");
  const { data, error, isLoading } = useSWR<PersonData>(`/api/wo/progress/staff/${id}?period=${period}`, apiFetcher, { refreshInterval: 60000 });

  if (isLoading && !data) {
    return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" /></div>;
  }
  if (error || !data) {
    return (
      <div className="space-y-3">
        <Link href="/wo/progress" className="link-action text-xs">← WO Progress</Link>
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error?.message ?? "Could not load this person's work"}</div>
      </div>
    );
  }

  const { person: p, summary: s } = data;
  const periodLabel = PERIODS.find((x) => x.value === period)?.label.toLowerCase() ?? "";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/wo/progress" className="link-action text-xs">← WO Progress</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{p.name}</h1>
            <p className="text-sm text-gray-500">{p.roleName}{p.subTeam ? ` · Pod ${p.subTeam}` : ""}</p>
          </div>
          <label className="text-xs text-gray-500">History shown
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
              {PERIODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active now" value={s.active} tone="text-blue-600" />
        <Stat label="Overdue" value={s.overdue} tone={s.overdue > 0 ? "text-red-600" : "text-green-600"} />
        <Stat label="Due this week" value={s.dueThisWeek} tone={s.dueThisWeek > 0 ? "text-orange-600" : "text-gray-900"} />
        <Stat label="Closed" value={s.closed} sub={periodLabel} />
        <Stat label="On time" value={s.onTimePct === null ? "—" : `${s.onTimePct}%`} sub={s.avgDays === null ? undefined : `avg ${s.avgDays} days to close`} tone={s.onTimePct === null ? "text-gray-900" : s.onTimePct >= 90 ? "text-green-600" : s.onTimePct >= 70 ? "text-yellow-600" : "text-red-600"} />
        <Stat label="Effort logged" value={`${s.effortHours} h`} sub={periodLabel} />
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">Current work ({data.current.length})</h2>
        <p className="text-xs text-gray-500">Click a work order to see its tasks and progress. Tasks owned by {p.name} are highlighted.</p>
        {data.current.length === 0
          ? <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">Nothing active right now.</div>
          : data.current.map((w) => <WoCard key={w.id} wo={w} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">History ({data.history.length})</h2>
        <p className="text-xs text-gray-500">Closed and cancelled work orders, {periodLabel}, newest first.</p>
        {data.history.length === 0
          ? <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">No closed work orders in this period.</div>
          : data.history.map((w) => <WoCard key={w.id} wo={w} history />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-800">Effort log ({data.effort.length}{data.effort.length === 100 ? "+" : ""})</h2>
        <p className="text-xs text-gray-500">Daily hours {p.name} logged, {periodLabel}, newest first (latest 100).</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="px-4 py-2">Date</th><th className="px-2 py-2">Work order</th><th className="px-2 py-2 text-right">Hours</th><th className="px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.effort.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No effort logged in this period.</td></tr>}
              {data.effort.map((e, n) => (
                <tr key={n} className="border-b border-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-600">{day(e.logDate)}</td>
                  <td className="px-2 py-2"><Link href={`/wo/${e.woId}`} className="link-action">{e.csiWoNo}</Link> <span className="text-gray-500">{e.title}</span></td>
                  <td className="px-2 py-2 text-right text-gray-800">{e.hours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-gray-600">{e.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
