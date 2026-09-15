import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { zodError, internalError } from "@/lib/response";
import { woListQuerySchema } from "@/lib/validations/wo.schema";
import { listWorkOrdersForExport, type WoListItem } from "@/lib/repositories/wo.repo";

const formatDate = (v: unknown) => (v ? new Date(v as string).toLocaleDateString("en-MY") : "");

const COLUMNS: { key: keyof WoListItem; header: string; map?: (v: unknown) => unknown }[] = [
  { key: "csiWoNo", header: "CSI WO No." },
  { key: "extWoNo", header: "Ext WO No." },
  { key: "tenderNo", header: "Tender No." },
  { key: "title", header: "Title" },
  { key: "sourceOfWO", header: "Source" },
  { key: "domain", header: "Domain" },
  { key: "requestTypeName", header: "Request Type" },
  { key: "priority", header: "Priority" },
  { key: "tierName", header: "Complexity Tier" },
  { key: "assignedToName", header: "Assignee" },
  { key: "dueDate", header: "Due Date", map: formatDate },
  { key: "slaDaysRemaining", header: "SLA Days Remaining" },
  { key: "slaStatus", header: "SLA Status" },
  { key: "status", header: "Status" },
  { key: "progressPercent", header: "Progress %" },
  { key: "effortHoursTotal", header: "Effort Hours" },
  { key: "evidenceCount", header: "Evidence Count" },
  { key: "indicativeValue", header: "Indicative Value" },
  { key: "createdAt", header: "Created At", map: formatDate },
  { key: "lastActivityAt", header: "Last Activity", map: formatDate },
];

function toCsv(rows: WoListItem[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.map((c) => c.header).join(",")];
  for (const row of rows) {
    lines.push(
      COLUMNS.map((c) => escape(c.map ? c.map(row[c.key]) : row[c.key])).join(",")
    );
  }
  return lines.join("\r\n");
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const parsed = woListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const rows = await listWorkOrdersForExport(parsed.data, scope);
    const csv = toCsv(rows);

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="work-orders-${stamp}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/export] GET error", err);
    return internalError(reqId);
  }
}
