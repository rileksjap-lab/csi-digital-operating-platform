"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { apiFetcher } from "@/lib/api/fetcher";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "wo_deadline" | "tender_closing" | "cert_expiry";
  meta?: string;
}

const EVENT_CONFIG = {
  wo_deadline: { label: "WO Deadline", color: "bg-red-500", dotColor: "bg-red-400", textColor: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" },
  tender_closing: { label: "Tender Closing", color: "bg-blue-500", dotColor: "bg-blue-400", textColor: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  cert_expiry: { label: "Cert Expiry", color: "bg-amber-500", dotColor: "bg-amber-400", textColor: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
} as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    wo_deadline: true,
    tender_closing: true,
    cert_expiry: true,
  });

  const { data: events } = useSWR<CalendarEvent[]>(
    `/api/calendar?month=${month + 1}&year=${year}`,
    apiFetcher
  );

  const filteredEvents = useMemo(
    () => (events ?? []).filter((e) => filters[e.type]),
    [events, filters]
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of filteredEvents) {
      (map[e.date] ??= []).push(e);
    }
    return map;
  }, [filteredEvents]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [year, month]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
    setSelectedDate(null);
  }
  function goToday() {
    setMonth(today.getMonth());
    setYear(today.getFullYear());
    setSelectedDate(null);
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
        <div className="flex items-center gap-2">
          {(Object.keys(EVENT_CONFIG) as (keyof typeof EVENT_CONFIG)[]).map((type) => (
            <button
              key={type}
              onClick={() => setFilters((f) => ({ ...f, [type]: !f[type] }))}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                filters[type]
                  ? `${EVENT_CONFIG[type].bgColor} ${EVENT_CONFIG[type].textColor} ${EVENT_CONFIG[type].borderColor}`
                  : "bg-gray-100 text-gray-400 border-gray-200 line-through"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${filters[type] ? EVENT_CONFIG[type].color : "bg-gray-300"}`} />
              {EVENT_CONFIG[type].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Calendar Grid */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm">
          {/* Month navigation */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-gray-100 text-gray-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">
                {MONTHS[month]} {year}
              </h2>
              <button
                onClick={goToday}
                className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Today
              </button>
            </div>
            <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-gray-100 text-gray-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-gray-50" />;

              const ds = dateStr(day);
              const dayEvents = eventsByDate[ds] ?? [];
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;

              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDate(ds === selectedDate ? null : ds)}
                  className={`min-h-[80px] border-b border-r border-gray-50 p-1.5 text-left hover:bg-gray-50 transition-colors ${
                    isSelected ? "bg-primary-50 ring-1 ring-primary-300" : ""
                  }`}
                >
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-accent-500 text-white"
                      : "text-gray-700"
                  }`}>
                    {day}
                  </span>
                  {dayEvents.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${EVENT_CONFIG[e.type].dotColor}`} />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-gray-400 ml-0.5">+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side panel — selected day events */}
        <div className="w-72 shrink-0">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {selectedDate
                  ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-MY", {
                      weekday: "long", day: "numeric", month: "long",
                    })
                  : "Select a day"}
              </h3>
            </div>
            <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
              {!selectedDate ? (
                <p className="text-xs text-gray-400 py-4 text-center">Click a day to see events</p>
              ) : selectedEvents.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No events on this day</p>
              ) : (
                selectedEvents.map((e) => {
                  const cfg = EVENT_CONFIG[e.type];
                  const href =
                    e.type === "wo_deadline" ? `/wo/${e.id}` :
                    e.type === "tender_closing" ? `/workloads` :
                    `/skills`;

                  return (
                    <Link
                      key={`${e.type}-${e.id}`}
                      href={href}
                      className={`block rounded-lg border ${cfg.borderColor} ${cfg.bgColor} p-2.5 hover:shadow-sm transition-shadow`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`h-2 w-2 rounded-full ${cfg.color}`} />
                        <span className={`text-[10px] font-medium ${cfg.textColor}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs font-medium text-gray-900 line-clamp-2">{e.title}</p>
                      {e.meta && (
                        <p className="mt-0.5 text-[10px] text-gray-500">{e.meta}</p>
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="mt-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h4 className="text-xs font-semibold text-gray-900 mb-2">This Month</h4>
            {(Object.keys(EVENT_CONFIG) as (keyof typeof EVENT_CONFIG)[]).map((type) => {
              const count = filteredEvents.filter((e) => e.type === type).length;
              const cfg = EVENT_CONFIG[type];
              return (
                <div key={type} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${cfg.color}`} />
                    <span className="text-xs text-gray-600">{cfg.label}</span>
                  </div>
                  <span className={`text-xs font-semibold ${cfg.textColor}`}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
