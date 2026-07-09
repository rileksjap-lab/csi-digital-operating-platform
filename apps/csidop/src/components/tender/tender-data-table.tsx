"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TenderStatusBadge from "@/components/tender/tender-status-badge";
import type { PaginationMeta } from "@/lib/types/api";

interface TenderRow {
  id: string;
  tenderNo: string;
  tenderName: string;
  client: string;
  tenderCategory: string | null;
  closingDate: string;
  estimatedValue: number;
  submittedValue: number | null;
  winValue: number | null;
  status: string;
  ownerName: string;
}

interface Props {
  rows: TenderRow[];
  meta: PaginationMeta | null;
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const COLUMNS = [
  { key: "tenderNo", label: "Tender No.", sortable: true },
  { key: "tenderName", label: "Name", sortable: true },
  { key: "client", label: "Client", sortable: true },
  { key: "tenderCategory", label: "Category", sortable: false },
  { key: "closingDate", label: "Closing Date", sortable: true },
  { key: "estimatedValue", label: "Est. Value (RM)", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "ownerName", label: "Owner", sortable: false },
];

export default function TenderDataTable({ rows, meta }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sortBy") ?? "createdAt";
  const currentDir = searchParams.get("sortDir") ?? "desc";

  const pageOffset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  function handleSort(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (currentSort === key) {
      params.set("sortDir", currentDir === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", key);
      params.set("sortDir", "asc");
    }
    params.delete("after");
    params.delete("offset");
    router.replace(`?${params.toString()}`);
  }

  function handleNextPage() {
    if (!meta?.nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("after", meta.nextCursor);
    params.set("offset", String(pageOffset + rows.length));
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
                    col.sortable
                      ? "cursor-pointer select-none hover:text-gray-700"
                      : ""
                  }`}
                  onClick={
                    col.sortable ? () => handleSort(col.key) : undefined
                  }
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
                  No tenders found
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
                    href={`/tenders/${row.id}`}
                    className="font-mono text-xs text-primary-600 hover:underline"
                  >
                    {row.tenderNo}
                  </Link>
                </td>
                <td className="px-4 py-3 max-w-[250px] truncate">
                  <Link
                    href={`/tenders/${row.id}`}
                    className="hover:text-primary-600"
                  >
                    {row.tenderName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {row.client}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {row.tenderCategory ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {new Date(row.closingDate).toLocaleDateString("en-MY")}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 text-right tabular-nums">
                  {formatCurrency(row.estimatedValue)}
                </td>
                <td className="px-4 py-3">
                  <TenderStatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {row.ownerName}
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
              ? `Showing ${pageOffset + 1}-${pageOffset + rows.length} of ${meta.total} tenders`
              : `Showing 0 of ${meta.total} tenders`}
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
