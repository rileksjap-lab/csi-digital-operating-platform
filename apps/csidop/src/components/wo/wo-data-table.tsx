"use client";

import Link from "next/link";
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
  sourceOfWO: string | null;
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
  createdAt: string;
}

interface Props {
  rows: WoRow[];
  meta: PaginationMeta | null;
  cursor: string | null;
  pageOffset: number;
  sortBy: string;
  sortDir: string;
  onSort: (key: string) => void;
  onNextPage: () => void;
  onFirstPage: () => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: () => void;
}

const COLUMNS = [
  { key: "csiWoNo", label: "WO No.", sortable: true },
  { key: "title", label: "Title", sortable: true },
  { key: "sourceOfWO", label: "Source", sortable: false },
  { key: "domain", label: "Domain", sortable: false },
  { key: "priority", label: "Priority", sortable: true },
  { key: "assignedToName", label: "Assignee", sortable: false },
  { key: "dueDate", label: "Due Date", sortable: true },
  { key: "sla", label: "SLA", sortable: false },
  { key: "status", label: "Status", sortable: true },
  { key: "progressPercent", label: "Progress", sortable: false },
  { key: "createdAt", label: "Created", sortable: true },
];

export default function WoDataTable({
  rows,
  meta,
  cursor,
  pageOffset,
  sortBy,
  sortDir,
  onSort,
  onNextPage,
  onFirstPage,
  selectable = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
}: Props) {
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectedIds?.has(r.id));

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {selectable && (
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    aria-label="Select all"
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    col.sortable ? "cursor-pointer select-none hover:text-gray-700" : ""
                  }`}
                  onClick={col.sortable ? () => onSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortBy === col.key && (
                      <span className="text-primary-600">
                        {sortDir === "asc" ? "↑" : "↓"}
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
                  colSpan={COLUMNS.length + (selectable ? 1 : 0)}
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
                {selectable && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(row.id) ?? false}
                      onChange={() => onToggleRow?.(row.id)}
                      aria-label={`Select ${row.csiWoNo}`}
                      className="rounded border-gray-300"
                    />
                  </td>
                )}
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
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {row.sourceOfWO ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{row.domain}</td>
                <td className="px-4 py-3">
                  <WoPriorityBadge priority={row.priority} />
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
                <td className="px-4 py-3 text-xs text-gray-500 tabular-nums">
                  {new Date(row.createdAt).toLocaleDateString("en-MY")}
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
            {rows.length > 0
              ? `Showing ${pageOffset + 1}-${pageOffset + rows.length} of ${meta.total} work orders`
              : `Showing 0 of ${meta.total} work orders`}
          </span>
          <div className="flex items-center gap-2">
            {cursor && (
              <button
                onClick={onFirstPage}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                &larr; First page
              </button>
            )}
            {meta.hasNextPage && (
              <button
                onClick={onNextPage}
                className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
              >
                Next page &rarr;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
