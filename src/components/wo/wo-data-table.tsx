"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import WoStatusBadge from "@/components/wo/wo-status-badge";
import WoPriorityBadge from "@/components/wo/wo-priority-badge";
import WoSlaBadge from "@/components/wo/wo-sla-badge";
import type { PaginationMeta } from "@/lib/types/api";

interface WoRow {
  id: string;
  csiWoNo: string;
  title: string;
  domain: string;
  requestTypeName: string;
  priority: string;
  tierCode: number;
  assignedToName: string | null;
  dueDate: string | null;
  slaDaysRemaining: number | null;
  slaStatus: string | null;
  status: string;
  tenderNo: string | null;
  effortHoursTotal: number;
  evidenceCount: number;
  progressPercent: number;
}

interface Props {
  rows: WoRow[];
  meta: PaginationMeta | null;
}

const COLUMNS = [
  { key: "csiWoNo", label: "WO No.", sortable: true },
  { key: "title", label: "Title", sortable: true },
  { key: "domain", label: "Domain", sortable: false },
  { key: "requestTypeName", label: "Type", sortable: false },
  { key: "priority", label: "Priority", sortable: true },
  { key: "tierCode", label: "Tier", sortable: false },
  { key: "assignedToName", label: "Assignee", sortable: false },
  { key: "dueDate", label: "Due Date", sortable: true },
  { key: "sla", label: "SLA", sortable: false },
  { key: "status", label: "Status", sortable: true },
  { key: "progressPercent", label: "Progress", sortable: false },
  { key: "effortHoursTotal", label: "Effort (h)", sortable: false },
];

export default function WoDataTable({ rows, meta }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sortBy") ?? "createdAt";
  const currentDir = searchParams.get("sortDir") ?? "desc";

  function handleSort(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (currentSort === key) {
      params.set("sortDir", currentDir === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", key);
      params.set("sortDir", "asc");
    }
    params.delete("after");
    router.replace(`?${params.toString()}`);
  }

  function handleNextPage() {
    if (!meta?.nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("after", meta.nextCursor);
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    col.sortable ? "cursor-pointer select-none hover:text-gray-700" : ""
                  }`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && currentSort === col.key && (
                      <span className="text-primary-600">
                        {currentDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No work orders found
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/wo/${row.id}`}
                    className="font-mono text-xs text-primary-600 hover:underline"
                  >
                    {row.csiWoNo}
                  </Link>
                </td>
                <td className="px-4 py-3 max-w-[280px] truncate">
                  <Link href={`/wo/${row.id}`} className="hover:text-primary-600">
                    {row.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{row.domain}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{row.requestTypeName}</td>
                <td className="px-4 py-3">
                  <WoPriorityBadge priority={row.priority} />
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-500">
                  {row.tierCode}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {row.assignedToName ?? (
                    <span className="text-gray-400 italic">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {row.dueDate
                    ? new Date(row.dueDate).toLocaleDateString("en-MY")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <WoSlaBadge slaStatus={row.slaStatus} slaDaysRemaining={row.slaDaysRemaining} />
                </td>
                <td className="px-4 py-3">
                  <WoStatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-200 min-w-[48px]">
                      <div
                        className={`h-full rounded-full ${
                          row.progressPercent === 100 ? "bg-green-500" : "bg-primary-500"
                        }`}
                        style={{ width: `${row.progressPercent}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-gray-500 w-7 text-right">
                      {row.progressPercent}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 text-right tabular-nums">
                  {row.effortHoursTotal.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {meta && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
          <span>
            Showing {rows.length} of {meta.total} work orders
          </span>
          {meta.hasNextPage && (
            <button
              onClick={handleNextPage}
              className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
            >
              Next page
            </button>
          )}
        </div>
      )}
    </div>
  );
}
