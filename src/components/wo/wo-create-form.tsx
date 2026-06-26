"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import type {
  DepartmentRow,
  RequestTypeRow,
  TierRow,
} from "@/lib/types/db-rows";

export interface WoCreateLookups {
  departments: DepartmentRow[];
  requestTypes: RequestTypeRow[];
  tiers: TierRow[];
}

interface StaffOption {
  Id: string;
  StaffCode: string;
  Name: string;
  SubTeam: string | null;
  RoleCode: string;
  DeptCode: string;
}

interface WoCreateFormProps {
  lookups: WoCreateLookups;
  onSuccess: (created: { id: string }) => void;
}

const WO_SOURCES = [
  "CMT", "CSA", "CPO", "CBA", "CST", "CSO", "CGI", "CSF",
  "CHO", "Legal", "Procurement", "CSI HOD", "Others",
] as const;

const PRIORITIES = ["Critical", "Urgent", "High", "Normal", "Low"] as const;
const PRIORITIES_INTERNAL = ["Critical", "Urgent", "High", "Normal", "Low", "N/A"] as const;

const INPUT_CLS =
  "mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

export default function WoCreateForm({ lookups, onSuccess }: WoCreateFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [sourceOfWO, setSourceOfWO] = useState<string>("");
  const [requesterName, setRequesterName] = useState("");
  const [requestTypeId, setRequestTypeId] = useState("");
  const [tenderOrProjectCode, setTenderOrProjectCode] = useState("");
  const [title, setTitle] = useState("");
  const [priorityInterdepart, setPriorityInterdepart] = useState<string>("Normal");
  const [priorityInternal, setPriorityInternal] = useState<string>("");
  const [slaWorkingDays, setSlaWorkingDays] = useState("");
  const [tierId, setTierId] = useState("");
  const [complexityValue, setComplexityValue] = useState("");
  const [monitoringStaffId, setMonitoringStaffId] = useState("");
  const [remark, setRemark] = useState("");

  // Optional initial assignment
  const [assigneeId, setAssigneeId] = useState("");
  const [assignedHours, setAssignedHours] = useState("");
  const [showAssignment, setShowAssignment] = useState(false);

  // External WO fields (shown when source is not "CSI HOD")
  const [extWoNo, setExtWoNo] = useState("");
  const [sourceDeptId, setSourceDeptId] = useState("");
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Staff list for monitoring picker
  const { data: staffList } = useSWR<StaffOption[]>("/api/staff", apiFetcher);

  // Auto-set sourceDeptId when source changes (match dept code)
  useEffect(() => {
    if (!sourceOfWO || sourceOfWO === "CSI HOD" || sourceOfWO === "Others") {
      setSourceDeptId("");
      return;
    }
    const matchedDept = lookups.departments.find(
      (d) => d.DeptCode.toUpperCase() === sourceOfWO.toUpperCase()
    );
    if (matchedDept) setSourceDeptId(matchedDept.Id);
  }, [sourceOfWO, lookups.departments]);

  const isInternal = sourceOfWO === "CSI HOD";

  // Group request types by Domain
  const requestTypesByDomain = lookups.requestTypes.reduce<
    Record<string, RequestTypeRow[]>
  >((acc, rt) => {
    const domain = rt.Domain ?? "Other";
    if (!acc[domain]) acc[domain] = [];
    acc[domain].push(rt);
    return acc;
  }, {});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      sourceOfWO,
      requestTypeId,
      title: title.trim(),
      priorityInterdepart,
      tierId,
    };

    if (requesterName.trim()) body.requesterName = requesterName.trim();
    if (tenderOrProjectCode.trim()) body.tenderOrProjectCode = tenderOrProjectCode.trim();
    if (priorityInternal) body.priorityInternal = priorityInternal;
    if (slaWorkingDays) body.slaWorkingDays = Number(slaWorkingDays);
    if (complexityValue) body.complexityValue = Number(complexityValue);
    if (monitoringStaffId) body.monitoringStaffId = monitoringStaffId;
    if (remark.trim()) body.remark = remark.trim();

    // Optional assignment
    if (assigneeId && assignedHours) {
      body.assigneeId = assigneeId;
      body.assignedHours = Number(assignedHours);
    }

    // External WO fields
    if (!isInternal && extWoNo.trim()) body.extWoNo = extWoNo.trim();
    if (sourceDeptId) body.sourceDeptId = sourceDeptId;
    if (receivedDate) body.receivedDate = receivedDate;

    try {
      const created = await apiPost<{ id: string }>("/api/wo", body);
      onSuccess({ id: created.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create work order");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Section 1: Source & Classification ── */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Source & Classification
        </legend>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {/* Source of Work Order */}
          <div>
            <label htmlFor="sourceOfWO" className="block text-sm font-medium text-gray-700">
              Source of Work Order <span className="text-red-500">*</span>
            </label>
            <select
              id="sourceOfWO"
              required
              value={sourceOfWO}
              onChange={(e) => setSourceOfWO(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">Select source...</option>
              {WO_SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* PIC / Requester Name */}
          <div>
            <label htmlFor="requesterName" className="block text-sm font-medium text-gray-700">
              PIC / Requester Name
            </label>
            <input
              id="requesterName"
              type="text"
              maxLength={150}
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              className={INPUT_CLS}
              placeholder="Person-in-charge from source dept"
            />
            <p className="mt-1 text-xs text-gray-400">
              Name of the requestor or PIC from the source department
            </p>
          </div>

          {/* Request Type */}
          <div>
            <label htmlFor="requestTypeId" className="block text-sm font-medium text-gray-700">
              Request Type <span className="text-red-500">*</span>
            </label>
            <select
              id="requestTypeId"
              required
              value={requestTypeId}
              onChange={(e) => setRequestTypeId(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">Select request type...</option>
              {Object.entries(requestTypesByDomain).map(([domain, types]) => (
                <optgroup key={domain} label={domain}>
                  {types.map((rt) => (
                    <option key={rt.Id} value={rt.Id}>
                      {rt.TypeName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Tender / Project Code */}
          <div>
            <label htmlFor="tenderOrProjectCode" className="block text-sm font-medium text-gray-700">
              Tender No / Project Code
            </label>
            <input
              id="tenderOrProjectCode"
              type="text"
              maxLength={50}
              value={tenderOrProjectCode}
              onChange={(e) => setTenderOrProjectCode(e.target.value)}
              className={INPUT_CLS}
              placeholder="Optional"
            />
          </div>

          {/* Complexity Tier */}
          <div>
            <label htmlFor="tierId" className="block text-sm font-medium text-gray-700">
              Complexity Tier <span className="text-red-500">*</span>
            </label>
            <select
              id="tierId"
              required
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">Select tier...</option>
              {lookups.tiers.map((t) => (
                <option key={t.Id} value={t.Id}>
                  {t.TierName}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Tier 1 = Simple, Tier 2 = Moderate, Tier 3 = Complex. Determines approval level.
            </p>
          </div>
        </div>
      </fieldset>

      {/* ── Section 2: Task Description ── */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Task Description
        </legend>
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">
            Title / Task Description <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={INPUT_CLS}
            placeholder="Brief description of the work order"
          />
        </div>
      </fieldset>

      {/* ── Section 3: Priority & SLA ── */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Priority & SLA
        </legend>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          {/* Priority (Interdepart) */}
          <div>
            <label htmlFor="priorityInterdepart" className="block text-sm font-medium text-gray-700">
              Priority (Inter-department) <span className="text-red-500">*</span>
            </label>
            <select
              id="priorityInterdepart"
              value={priorityInterdepart}
              onChange={(e) => setPriorityInterdepart(e.target.value)}
              className={INPUT_CLS}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Set by the requestor</p>
          </div>

          {/* Priority (Internal) */}
          <div>
            <label htmlFor="priorityInternal" className="block text-sm font-medium text-gray-700">
              Priority (Internal)
            </label>
            <select
              id="priorityInternal"
              value={priorityInternal}
              onChange={(e) => setPriorityInternal(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">— Not set —</option>
              {PRIORITIES_INTERNAL.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">CSI&apos;s own assessment</p>
          </div>

          {/* SLA Working Days */}
          <div>
            <label htmlFor="slaWorkingDays" className="block text-sm font-medium text-gray-700">
              SLA (Working Days)
            </label>
            <input
              id="slaWorkingDays"
              type="number"
              min={1}
              step={1}
              value={slaWorkingDays}
              onChange={(e) => setSlaWorkingDays(e.target.value)}
              className={INPUT_CLS}
              placeholder="e.g. 10"
            />
          </div>
        </div>
      </fieldset>

      {/* ── Section 4: Monitoring & Complexity ── */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Monitoring & Complexity
        </legend>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {/* WO Monitoring */}
          <div>
            <label htmlFor="monitoringStaffId" className="block text-sm font-medium text-gray-700">
              WO Monitoring
            </label>
            <select
              id="monitoringStaffId"
              value={monitoringStaffId}
              onChange={(e) => setMonitoringStaffId(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="">— Not assigned —</option>
              {(staffList ?? []).map((s) => (
                <option key={s.Id} value={s.Id}>
                  {s.Name} ({s.RoleCode}{s.SubTeam ? ` · Pod ${s.SubTeam}` : ""})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Staff who oversees this WO</p>
          </div>

          {/* Complexity Value */}
          <div>
            <label htmlFor="complexityValue" className="block text-sm font-medium text-gray-700">
              Complexity Value
            </label>
            <input
              id="complexityValue"
              type="number"
              min={0}
              step="0.01"
              value={complexityValue}
              onChange={(e) => setComplexityValue(e.target.value)}
              className={INPUT_CLS}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-gray-400">
              Use the indicative project/tender value (RM) if available, or estimate total
              man-days x daily rate. For internal WOs with no commercial value, enter 0.
            </p>
          </div>
        </div>
      </fieldset>

      {/* ── Section 5: Initial Assignment (optional) ── */}
      <fieldset>
        <div className="flex items-center justify-between mb-3">
          <legend className="text-sm font-semibold text-gray-900">
            Assign To Staff
          </legend>
          <button
            type="button"
            onClick={() => {
              setShowAssignment(!showAssignment);
              if (showAssignment) {
                setAssigneeId("");
                setAssignedHours("");
              }
            }}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            {showAssignment ? "Remove assignment" : "+ Assign now"}
          </button>
        </div>
        {!showAssignment && (
          <p className="text-xs text-gray-400">
            You can assign later from the WO detail page.
          </p>
        )}
        {showAssignment && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {/* Assignee */}
            <div>
              <label htmlFor="assigneeId" className="block text-sm font-medium text-gray-700">
                Assignee <span className="text-red-500">*</span>
              </label>
              <select
                id="assigneeId"
                required={showAssignment}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">Select staff...</option>
                {(staffList ?? []).map((s) => (
                  <option key={s.Id} value={s.Id}>
                    {s.Name} ({s.RoleCode}{s.SubTeam ? ` · Pod ${s.SubTeam}` : ""})
                  </option>
                ))}
              </select>
            </div>

            {/* Assigned Hours */}
            <div>
              <label htmlFor="assignedHours" className="block text-sm font-medium text-gray-700">
                Assigned Hours <span className="text-red-500">*</span>
              </label>
              <input
                id="assignedHours"
                type="number"
                required={showAssignment}
                min={0.5}
                step={0.5}
                value={assignedHours}
                onChange={(e) => setAssignedHours(e.target.value)}
                className={INPUT_CLS}
                placeholder="e.g. 24"
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* ── Section 6: External WO Details (only for external sources) ── */}
      {!isInternal && sourceOfWO && (
        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 mb-3">
            External WO Details
          </legend>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
            {/* External WO No */}
            <div>
              <label htmlFor="extWoNo" className="block text-sm font-medium text-gray-700">
                External WO No
              </label>
              <input
                id="extWoNo"
                type="text"
                maxLength={30}
                value={extWoNo}
                onChange={(e) => setExtWoNo(e.target.value)}
                className={INPUT_CLS}
                placeholder="e.g. EWM-2026-001"
              />
            </div>

            {/* Source Department (auto-matched) */}
            <div>
              <label htmlFor="sourceDeptId" className="block text-sm font-medium text-gray-700">
                Source Department
              </label>
              <select
                id="sourceDeptId"
                value={sourceDeptId}
                onChange={(e) => setSourceDeptId(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">Select department...</option>
                {lookups.departments.map((d) => (
                  <option key={d.Id} value={d.Id}>
                    {d.DeptName}
                  </option>
                ))}
              </select>
            </div>

            {/* Received Date */}
            <div>
              <label htmlFor="receivedDate" className="block text-sm font-medium text-gray-700">
                Received Date
              </label>
              <input
                id="receivedDate"
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
          </div>
        </fieldset>
      )}

      {/* ── Section 7: Remark ── */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-900 mb-3">
          Remark
        </legend>
        <div>
          <textarea
            id="remark"
            rows={3}
            maxLength={2000}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className={INPUT_CLS}
            placeholder="Additional notes or instructions (optional)"
          />
        </div>
      </fieldset>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
        <a
          href="/wo"
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create Work Order"}
        </button>
      </div>
    </form>
  );
}
