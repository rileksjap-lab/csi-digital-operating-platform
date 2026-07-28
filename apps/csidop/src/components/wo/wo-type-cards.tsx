"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

interface WoTypeCount {
  requestTypeId: string;
  typeName: string;
  count: number;
  soonestDueDate: string | null;
}

interface Props {
  queryString: string;
  activeTypeId: string;
  onSelect: (id: string) => void;
  hideHeading?: boolean;
}

const ACCENT_COLORS = [
  "bg-blue-400", "bg-teal-400", "bg-amber-400", "bg-purple-400",
  "bg-rose-400", "bg-emerald-400", "bg-indigo-400", "bg-orange-400",
  "bg-cyan-400", "bg-fuchsia-400", "bg-lime-500", "bg-sky-400",
];

function formatDueDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export default function WoTypeCards({ queryString, activeTypeId, onSelect, hideHeading }: Props) {
  const { data } = useSWR<WoTypeCount[]>(`/api/wo/by-type?${queryString}`, apiFetcher);

  if (!data || data.length === 0) return null;

  return (
    <div>
      {(!hideHeading || activeTypeId) && (
        <div className="mb-2 flex items-center justify-between">
          {!hideHeading && <h2 className="text-sm font-semibold text-gray-700">Work by Type</h2>}
          {activeTypeId && (
            <button
              onClick={() => onSelect(activeTypeId)}
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              Clear type filter
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {data.map((t, i) => (
          <button
            key={t.requestTypeId}
            onClick={() => onSelect(t.requestTypeId)}
            className={`min-w-[150px] overflow-hidden rounded-lg border text-left transition-colors ${
              activeTypeId === t.requestTypeId
                ? "border-primary-400 bg-primary-50"
                : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <div className={`h-1 w-full ${ACCENT_COLORS[i % ACCENT_COLORS.length]}`} />
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-800">{t.typeName}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    activeTypeId === t.requestTypeId
                      ? "bg-primary-100 text-primary-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {t.count}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                next due {formatDueDate(t.soonestDueDate)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
