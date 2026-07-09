"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import TenderStatusBadge from "@/components/tender/tender-status-badge";
import TenderEditDialog from "@/components/tender/tender-edit-dialog";
import TenderGoNoGoPanel from "@/components/tender/tender-gonogo-panel";

interface TenderDetail {
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
  owner: { id: string; name: string; roleCode: string };
  createdAt: string;
  updatedAt: string | null;
}

const EDIT_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);

  const { data: tender, error, isLoading, mutate } = useSWR<TenderDetail>(
    `/api/tender/${id}`,
    apiFetcher
  );

  const canEdit = user && EDIT_ROLES.includes(user.roleCode);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !tender) {
    return (
      <div className="space-y-4">
        <Link href="/workloads" className="text-sm text-primary-600 hover:underline">
          &larr; Back to Tenders
        </Link>
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error?.message ?? "Tender not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/workloads" className="text-sm text-primary-600 hover:underline">
          &larr; Back to Tenders
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-800">
            {tender.tenderNo}
          </h1>
          <TenderStatusBadge status={tender.status} />
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="ml-auto rounded border border-primary-300 bg-white px-3 py-1 text-sm font-medium text-primary-700 hover:bg-primary-50"
            >
              Edit
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">{tender.tenderName}</p>
      </div>

      {/* Edit form */}
      {editing && (
        <TenderEditDialog
          tenderId={tender.id}
          current={{
            tenderName: tender.tenderName,
            client: tender.client,
            tenderCategory: tender.tenderCategory,
            closingDate: tender.closingDate,
            estimatedValue: tender.estimatedValue,
            submittedValue: tender.submittedValue,
            winValue: tender.winValue,
            status: tender.status,
            ownerId: tender.owner.id,
          }}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            mutate();
          }}
        />
      )}

      {/* Overview */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Overview
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">Client</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">{tender.client}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Category</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {tender.tenderCategory ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Closing Date</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {new Date(tender.closingDate).toLocaleDateString("en-MY")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Estimated Value</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {formatCurrency(tender.estimatedValue)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Submitted Value</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {formatCurrency(tender.submittedValue)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Win Value</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {formatCurrency(tender.winValue)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Owner</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {tender.owner.name}
              <span className="ml-1 text-xs text-gray-400">({tender.owner.roleCode})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Created</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {new Date(tender.createdAt).toLocaleString("en-MY")}
            </dd>
          </div>
          {tender.updatedAt && (
            <div>
              <dt className="text-xs text-gray-500">Last Updated</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {new Date(tender.updatedAt).toLocaleString("en-MY")}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Go/No-Go Evaluations */}
      <TenderGoNoGoPanel tenderId={tender.id} />
    </div>
  );
}
