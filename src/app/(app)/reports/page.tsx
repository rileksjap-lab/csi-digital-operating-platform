"use client";

import { useState } from "react";

// ─── Report catalogue ───────────────────────────────────────────────────────

interface ReportDef {
  code: string;
  name: string;
  description: string;
  formats: string[];
  icon: string;
}

const REPORTS: ReportDef[] = [
  {
    code: "WO_TREND",
    name: "Monthly WO Trend",
    description: "Work order volume, status transitions, and SLA achievement trends by month.",
    formats: ["PDF", "Excel"],
    icon: "📊",
  },
  {
    code: "CAPACITY_UTIL",
    name: "Capacity & Utilization",
    description: "Staff utilization rates, capacity distribution by band, and department workload.",
    formats: ["PDF", "Excel"],
    icon: "📈",
  },
  {
    code: "CMT_CSI_LINKAGE",
    name: "CMT-to-CSI WO Linkage",
    description: "External work order linkage analysis showing CMT-originated requests flowing into CSI.",
    formats: ["PDF", "Excel"],
    icon: "🔗",
  },
  {
    code: "GOVERNANCE_AUDIT",
    name: "Governance & Compliance Audit Trail",
    description: "Audit log report with approval workflows, status changes, and compliance checkpoints.",
    formats: ["PDF"],
    icon: "🛡️",
  },
  {
    code: "KPI_ACHIEVEMENT",
    name: "KPI Achievement",
    description: "Individual and team KPI scorecard with achievement status against quarterly targets.",
    formats: ["PDF", "Excel", "PPTX"],
    icon: "🎯",
  },
  {
    code: "OI_COMMISSION",
    name: "OI & Commission",
    description: "Opportunity Index tracking with registered/won counts and commission calculations.",
    formats: ["PDF", "Excel"],
    icon: "💰",
  },
  {
    code: "RESOURCE_CAPACITY",
    name: "Resource Capacity",
    description: "Forward-looking capacity projection with Go/No-Go evaluation outcomes by period.",
    formats: ["PDF", "Excel"],
    icon: "👥",
  },
  {
    code: "COMPETENCY_GAP",
    name: "Competency Gap Analysis",
    description: "Skills coverage heatmap, single-point-dependency flags, and training gap identification.",
    formats: ["PDF", "Excel"],
    icon: "🧠",
  },
  {
    code: "CERT_COMPLIANCE",
    name: "Certification Compliance",
    description: "Certification registry status, upcoming expirations, and compliance coverage by domain.",
    formats: ["PDF", "Excel"],
    icon: "📜",
  },
  {
    code: "TENDER_PIPELINE",
    name: "Tender Pipeline",
    description: "Active tender pipeline with status distribution, estimated values, and win-rate trends.",
    formats: ["PDF", "Excel", "PPTX"],
    icon: "📋",
  },
  {
    code: "CHAIRMAN_SUMMARY",
    name: "Chairman Executive Summary",
    description: "High-level executive summary combining operations, business, and capability metrics.",
    formats: ["PDF", "PPTX"],
    icon: "📑",
  },
];

// ─── Components ─────────────────────────────────────────────────────────────

function ReportCard({
  report,
  onSelect,
}: {
  report: ReportDef;
  onSelect: (code: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(report.code)}
      className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-accent-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{report.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 group-hover:text-accent-600 transition-colors">
            {report.name}
          </h3>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{report.description}</p>
          <div className="flex gap-1 mt-2">
            {report.formats.map((f) => (
              <span
                key={f}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

const BLOCKED_REPORTS: string[] = [];

function ParameterPanel({
  report,
  onClose,
}: {
  report: ReportDef;
  onClose: () => void;
}) {
  const availableFormats = BLOCKED_REPORTS.includes(report.code)
    ? report.formats
    : ["CSV", ...report.formats.filter((f) => f !== "CSV")];
  const [format, setFormat] = useState(availableFormats[0]);
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [periodTo, setPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isBlocked = BLOCKED_REPORTS.includes(report.code);
  const needsWorker = ["Excel"].includes(format);
  const BINARY_FORMATS: Record<string, string> = { CSV: "csv", PDF: "pdf", PPTX: "pptx" };

  async function handleGenerate() {
    setError("");
    setSuccess("");
    setGenerating(true);
    try {
      const exportFormat = format === "Excel" ? "CSV" : format;
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportCode: report.code,
          periodFrom,
          periodTo,
          format: exportFormat,
        }),
      });

      const ext = BINARY_FORMATS[exportFormat];
      if (ext) {
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error?.message ?? `Error ${res.status}`);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${report.code}_${periodFrom}_${periodTo}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        setSuccess(`${exportFormat} downloaded successfully`);
      } else {
        const json = await res.json();
        if (!json.success) {
          setError(json.error?.message ?? "Generation failed");
          return;
        }
        const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${report.code}_${periodFrom}_${periodTo}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setSuccess(`JSON downloaded — ${json.data.rowCount} rows`);
      }
    } catch {
      setError("Network error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{report.icon}</span>
          <h2 className="text-base font-semibold text-gray-800">{report.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg"
        >
          &times;
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Period From</label>
          <input
            type="date"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Period To</label>
          <input
            type="date"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {availableFormats.map((f) => (
              <option key={f} value={f}>
                {f}{f === "CSV" ? " (Available)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
          {success}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {needsWorker
            ? "Excel format requires the FastAPI compute worker. Use CSV, PDF, or PPTX for immediate export."
            : `Export ${report.name} data as ${format}.`}
        </p>
        <button
          disabled={generating || isBlocked || needsWorker}
          onClick={handleGenerate}
          className="btn-primary"
          title={isBlocked ? "This report requires the FastAPI compute worker" : needsWorker ? "Select CSV, PDF, or PPTX for immediate export" : ""}
        >
          {generating ? "Generating..." : "Generate Report"}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const selectedReport = REPORTS.find((r) => r.code === selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select a report to configure parameters and generate
        </p>
      </div>

      {/* Parameter panel */}
      {selectedReport && (
        <ParameterPanel
          report={selectedReport}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Report card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => (
          <ReportCard key={r.code} report={r} onSelect={setSelected} />
        ))}
      </div>

      {/* Generation history placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">My Generated Reports</h2>
        </div>
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          No reports generated yet. Select a report above to get started.
        </div>
      </div>
    </div>
  );
}
