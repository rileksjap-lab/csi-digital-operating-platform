"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
import { apiFetcher } from "@/lib/api/fetcher";
import type { MeResponse } from "@/lib/stores/auth.store";
import Sidebar from "@/components/layout/sidebar";
import Topbar from "@/components/layout/topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, setUser } = useAuthStore();

  useEffect(() => {
    apiFetcher<MeResponse>("/api/auth/me")
      .then(setUser)
      .catch(() => {
        setUser(null);
        router.push("/login");
      });
  }, [setUser, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-navy-900">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo-10cs.svg" alt="10CS" width={60} height={50} className="animate-pulse" />
          <p className="text-sm text-navy-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
