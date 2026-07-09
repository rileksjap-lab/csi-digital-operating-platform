"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useState } from "react";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";

interface StaffItem {
  Id: string;
  Name: string;
  RoleCode: string;
  DeptCode: string;
}

const CATEGORIES = ["Government", "Private", "GLC", "International"];

export default function TenderCreatePage() {
  const router = useRouter();
  const { data: staff } = useSWR<StaffItem[]>("/api/staff", apiFetcher);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenderName, setTenderName] = useState("");
  const [client, setClient] = useState("");
  const [tenderCategory, setTenderCategory] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [submittedValue, setSubmittedValue] = useState("");
  const [tenderOwnerId, setTenderOwnerId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      tenderName: tenderName.trim(),
      client: client.trim(),
      closingDate,
      estimatedValue: Number(estimatedValue),
      tenderOwnerId,
    };

    if (tenderCategory) body.tenderCategory = tenderCategory;
    if (submittedValue) body.submittedValue = Number(submittedValue);

    try {
      const created = await apiPost<{ id: string }>("/api/tender", body);
      router.push(`/tenders/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tender");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-800">New Tender</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {/* Tender Name — full width */}
            <div className="sm:col-span-2">
              <label htmlFor="tenderName" className="block text-sm font-medium text-gray-700">
                Tender Name <span className="text-red-500">*</span>
              </label>
              <input
                id="tenderName"
                type="text"
                required
                maxLength={200}
                value={tenderName}
                onChange={(e) => setTenderName(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Name of the tender"
              />
            </div>

            {/* Client */}
            <div>
              <label htmlFor="client" className="block text-sm font-medium text-gray-700">
                Client <span className="text-red-500">*</span>
              </label>
              <input
                id="client"
                type="text"
                required
                maxLength={200}
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Client name"
              />
            </div>

            {/* Category */}
            <div>
              <label htmlFor="tenderCategory" className="block text-sm font-medium text-gray-700">
                Category
              </label>
              <select
                id="tenderCategory"
                value={tenderCategory}
                onChange={(e) => setTenderCategory(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Select category...</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Closing Date */}
            <div>
              <label htmlFor="closingDate" className="block text-sm font-medium text-gray-700">
                Closing Date <span className="text-red-500">*</span>
              </label>
              <input
                id="closingDate"
                type="date"
                required
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Estimated Value */}
            <div>
              <label htmlFor="estimatedValue" className="block text-sm font-medium text-gray-700">
                Estimated Value (RM) <span className="text-red-500">*</span>
              </label>
              <input
                id="estimatedValue"
                type="number"
                required
                min={0.01}
                step="0.01"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="0.00"
              />
            </div>

            {/* Submitted Value */}
            <div>
              <label htmlFor="submittedValue" className="block text-sm font-medium text-gray-700">
                Submitted Value (RM)
              </label>
              <input
                id="submittedValue"
                type="number"
                min={0}
                step="0.01"
                value={submittedValue}
                onChange={(e) => setSubmittedValue(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="0.00"
              />
            </div>

            {/* Tender Owner */}
            <div>
              <label htmlFor="tenderOwnerId" className="block text-sm font-medium text-gray-700">
                Tender Owner <span className="text-red-500">*</span>
              </label>
              <select
                id="tenderOwnerId"
                required
                value={tenderOwnerId}
                onChange={(e) => setTenderOwnerId(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Select owner...</option>
                {staff?.map((s) => (
                  <option key={s.Id} value={s.Id}>
                    {s.Name} ({s.RoleCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <a
              href="/workloads"
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Tender"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
