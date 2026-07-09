"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const REASONS: Record<string, string> = {
  no_account:
    "No account found for your email address. Please contact your administrator to get access.",
};

function AuthErrorInner() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") ?? "unknown";
  const message =
    REASONS[reason] ?? "An authentication error occurred. Please try again.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <span className="text-red-600 text-xl">!</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-800 mb-2">
          Authentication Error
        </h1>
        <p className="text-sm text-gray-600 mb-6">{message}</p>
        <Link
          href="/login"
          className="inline-flex items-center rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <AuthErrorInner />
    </Suspense>
  );
}
