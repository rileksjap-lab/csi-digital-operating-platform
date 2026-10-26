"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/stores/auth.store";
import KpiSetup from "@/components/kpi/kpi-setup";

export default function KpiSetupPage() {
  const role = useAuthStore((s) => s.user?.role);

  if (role && role !== "HOD" && role !== "SVP") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Only the HOD and the SVP can open the KPI setup.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/kpi/appraisals" className="link-action text-xs">← KPI Appraisal</Link>
        <h1 className="text-xl font-semibold text-gray-800">KPI Setup</h1>
        <p className="text-sm text-gray-500">
          The criteria, weights, targets and rating definitions used on the KPI appraisal forms. Changes are saved to the audit log.
        </p>
      </div>
      <KpiSetup canEdit={role === "HOD"} />
    </div>
  );
}
