"use client";

import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

interface WoPodCount {
  pod: string;
  count: number;
  soonestDueDate: string | null;
}

interface Props {
  queryString: string;
  activePod: string;
  onSelect: (pod: string) => void;
  hideHeading?: boolean;
}

const ACCENT_COLORS = [
  "bg-emerald-400", "bg-sky-400", "bg-violet-400", "bg-orange-400",
  "bg-pink-400", "bg-teal-400", "bg-amber-400", "bg-indigo-400",
];

function formatDueDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

export default function WoPodCards({ queryString, activePod, onSelect, hideHeading }: Props) {
  const { data } = useSWR<WoPodCount[]>(`/api/wo/by-pod?${queryString}`, apiFetcher);

  if (!data || data.length === 0) return null;

  return (
    <div>
      {(!hideHeading || activePod) && (
        <div className="mb-2 flex items-center justify-between">
          {!hideHeading && <h2 className="text-sm font-semibold text-gray-700">Work by Pod</h2>}
          {activePod && (
            <button
              onClick={() => onSelect(activePod)}
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              Clear pod filter
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {data.map((p, i) => (
          <button
            key={p.pod}
            onClick={() => onSelect(p.pod)}
            className={`min-w-[150px] overflow-hidden rounded-lg border text-left transition-colors ${
              activePod === p.pod
                ? "border-primary-400 bg-primary-50"
                : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <div className={`h-1 w-full ${ACCENT_COLORS[i % ACCENT_COLORS.length]}`} />
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-gray-800">{p.pod}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    activePod === p.pod
                      ? "bg-primary-100 text-primary-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {p.count}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                next due {formatDueDate(p.soonestDueDate)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
