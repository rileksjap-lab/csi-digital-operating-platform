"use client";

import { useState } from "react";

interface Props {
  wo: {
    createdAt: string;
    createdBy: { name: string };
    dueDate: string | null;
    status: string;
    tasks: { taskNo: number; description: string; dateCompleted: string | null; status: string }[];
    assignmentHistory: {
      assignedTo: string;
      assignedBy: string;
      assignedHours: number;
      assignedDate: string;
      reassignReason: string | null;
    }[];
    effortLog: { staffName: string; logDate: string; hours: number }[];
    evidenceItems: {
      fileRef: string;
      evidenceType: string;
      caption: string | null;
      uploadedByName: string;
      uploadedDate: string;
    }[];
    approvalTrail: {
      tierName: string;
      approvedByName: string;
      decision: string;
      reason: string | null;
      decisionDate: string;
    }[];
    activityLog: {
      action: string;
      fieldName: string | null;
      oldValue: string | null;
      newValue: string | null;
      reason: string | null;
      performedAt: string;
      performedByName: string;
    }[];
  };
}

type Kind = "milestone" | "assignment" | "task" | "effort" | "evidence" | "change";

interface TimelineEvent {
  at: number;
  kind: Kind;
  title: string;
  detail?: string;
  by?: string;
  dateOnly?: boolean;
  upcoming?: boolean;
}

const KIND_STYLE: Record<Kind, { dot: string; label: string }> = {
  milestone: { dot: "bg-primary-600", label: "Milestones" },
  assignment: { dot: "bg-purple-500", label: "Assignments" },
  task: { dot: "bg-green-500", label: "Tasks" },
  effort: { dot: "bg-blue-400", label: "Effort" },
  evidence: { dot: "bg-amber-500", label: "Evidence" },
  change: { dot: "bg-gray-400", label: "Changes" },
};

const FIELD_LABELS: Record<string, string> = {
  PriorityInterdepart: "Priority",
  PriorityInternal: "Internal priority",
  DueDate: "Due date",
  TierId: "Complexity tier",
  RequestTypeId: "Request type",
  SourceOfWO: "Source",
  RequesterName: "Requester",
  SLAWorkingDays: "SLA working days",
  TenderOrProjectCode: "Tender / project code",
  TenderOutcome: "Tender outcome",
  TenderOutcomeValue: "Tender win value",
  ProjectTeam: "Project team",
  TaskSchedule: "Task schedule",
};

function buildEvents(wo: Props["wo"]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const ms = (v: string) => new Date(v).getTime();

  events.push({ at: ms(wo.createdAt), kind: "milestone", title: "Work order created", by: wo.createdBy.name });

  const assignments = [...wo.assignmentHistory].sort((a, b) => ms(a.assignedDate) - ms(b.assignedDate));
  assignments.forEach((a, i) => {
    events.push({
      at: ms(a.assignedDate),
      kind: "assignment",
      title: `${i === 0 ? "Assigned to" : "Reassigned to"} ${a.assignedTo} (${a.assignedHours}h)`,
      detail: a.reassignReason ? `Reason: ${a.reassignReason}` : undefined,
      by: a.assignedBy,
      dateOnly: true,
    });
  });

  for (const t of wo.tasks) {
    if (t.status !== "NA" && t.dateCompleted) {
      events.push({
        at: ms(t.dateCompleted),
        kind: "task",
        title: `Task #${t.taskNo} completed`,
        detail: t.description,
        dateOnly: true,
      });
    }
  }

  const byDay = new Map<string, { total: number; people: Map<string, number> }>();
  for (const e of wo.effortLog) {
    const key = new Date(e.logDate).toDateString();
    const day = byDay.get(key) ?? { total: 0, people: new Map<string, number>() };
    day.total += e.hours;
    day.people.set(e.staffName, (day.people.get(e.staffName) ?? 0) + e.hours);
    byDay.set(key, day);
  }
  for (const [key, day] of byDay) {
    events.push({
      at: new Date(key).getTime(),
      kind: "effort",
      title: `${Number(day.total.toFixed(1))}h effort logged`,
      detail: [...day.people].map(([name, h]) => `${name} ${Number(h.toFixed(1))}h`).join(", "),
      dateOnly: true,
    });
  }

  for (const ev of wo.evidenceItems) {
    events.push({
      at: ms(ev.uploadedDate),
      kind: "evidence",
      title: `Evidence uploaded: ${ev.caption || ev.fileRef}`,
      detail: ev.evidenceType,
      by: ev.uploadedByName,
    });
  }

  for (const ap of wo.approvalTrail) {
    events.push({
      at: ms(ap.decisionDate),
      kind: "milestone",
      title: `${ap.decision} (${ap.tierName})`,
      detail: ap.reason ? `Reason: ${ap.reason}` : undefined,
      by: ap.approvedByName,
    });
  }

  for (const al of wo.activityLog) {
    // Creation and assignment already appear above from their own records.
    if (al.action === "Insert" || al.fieldName === "AssignedTo") continue;
    const field = al.fieldName ? FIELD_LABELS[al.fieldName] ?? al.fieldName : al.action;
    const isStatus = al.fieldName === "Status";
    const change =
      al.oldValue && al.newValue ? `${al.oldValue} → ${al.newValue}` : al.newValue ?? al.oldValue ?? "";
    events.push({
      at: ms(al.performedAt),
      kind: isStatus ? "milestone" : "change",
      title: change ? `${field}: ${change}` : field,
      detail: al.reason ? `Reason: ${al.reason}` : undefined,
      by: al.performedByName,
    });
  }

  if (wo.dueDate) {
    const due = new Date(wo.dueDate);
    const dueMs = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
    const now = new Date();
    const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    events.push({
      at: dueMs,
      kind: "milestone",
      title: dueMs >= todayMs ? "Due date" : "Due date (passed)",
      dateOnly: true,
      upcoming: dueMs > todayMs && wo.status !== "Closed" && wo.status !== "Cancelled",
    });
  }

  return events.sort((a, b) => b.at - a.at);
}

export default function WoTimeline({ wo }: Props) {
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());
  const events = buildEvents(wo).filter((e) => !hidden.has(e.kind));

  function toggle(kind: Kind) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-2">
        {(Object.keys(KIND_STYLE) as Kind[]).map((k) => {
          const on = !hidden.has(k);
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${KIND_STYLE[k].dot}`} />
              {KIND_STYLE[k].label}
            </button>
          );
        })}
      </div>

      {events.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">Nothing to show with the current filters</div>
      ) : (
        <ol className="px-4 py-3">
          {events.map((e, i) => (
            <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
              {i < events.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-gray-200" />}
              <span className={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white ${KIND_STYLE[e.kind].dot} ${e.upcoming ? "opacity-40" : ""}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={`text-sm ${e.upcoming ? "text-gray-400" : "text-gray-800"}`}>{e.title}</p>
                  <p className="whitespace-nowrap text-xs tabular-nums text-gray-400">
                    {e.dateOnly
                      ? new Date(e.at).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
                      : new Date(e.at).toLocaleString("en-MY", {
                          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                  </p>
                </div>
                {(e.detail || e.by) && (
                  <p className="text-xs text-gray-500">
                    {e.detail}
                    {e.detail && e.by ? " · " : ""}
                    {e.by ? `by ${e.by}` : ""}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
