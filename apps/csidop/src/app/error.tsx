"use client";

import { useEffect, useState } from "react";

const STALE_DEPLOYMENT_PATTERNS = [
  "Failed to find Server Action",
  "Failed to find Server Reference",
];

function isStaleDeploymentError(message: string): boolean {
  return STALE_DEPLOYMENT_PATTERNS.some((pattern) => message.includes(pattern));
}

// Guards against a reload loop if something other than a stale deployment
// keeps producing the same error message.
const RELOAD_GUARD_KEY = "csidop-stale-action-reload-at";
const RELOAD_GUARD_WINDOW_MS = 10_000;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleDeploymentError(error.message);
  const [reloading, setReloading] = useState(stale);

  useEffect(() => {
    if (!stale) return;
    const lastReload = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Date.now() - lastReload > RELOAD_GUARD_WINDOW_MS) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      window.location.reload();
    } else {
      setReloading(false);
    }
  }, [stale]);

  if (reloading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <h1 className="text-lg font-semibold text-gray-800 mb-2">
            Updating to the latest version
          </h1>
          <p className="text-sm text-gray-600">
            The app was just updated. Reloading your page…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <span className="text-red-600 text-xl">!</span>
        </div>
        <h1 className="text-lg font-semibold text-gray-800 mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          An unexpected error occurred. Please try again, and contact your
          administrator if it persists.
        </p>
        <button
          onClick={() => reset()}
          className="inline-flex items-center rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
