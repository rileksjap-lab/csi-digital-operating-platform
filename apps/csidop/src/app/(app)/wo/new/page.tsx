"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import WoCreateForm from "@/components/wo/wo-create-form";
import type { WoCreateLookups } from "@/components/wo/wo-create-form";

export default function WoCreatePage() {
  const router = useRouter();

  const { data: lookups, error, isLoading } = useSWR<WoCreateLookups>(
    "/api/lookups",
    apiFetcher
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !lookups) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load form data. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">
          New Work Order
        </h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <WoCreateForm
          lookups={lookups}
          onSuccess={(created) => {
            router.push(`/wo/${created.id}`);
          }}
        />
      </div>
    </div>
  );
}
