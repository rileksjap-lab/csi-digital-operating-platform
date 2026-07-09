"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth.store";
import NotificationBell from "./notification-bell";

const ROLE_COLORS: Record<string, string> = {
  HOD: "bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20",
  SM: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
  TL: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
  TM: "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20",
  BIM_TL: "bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20",
  BIM_MOD: "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20",
};

interface TopbarProps {
  onMenuToggle?: () => void;
}

export default function Topbar({ onMenuToggle }: TopbarProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
  }

  if (!user) return null;

  const badgeClass = ROLE_COLORS[user.roleCode] ?? "bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20";

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger menu for mobile */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-1.5 -ml-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="text-sm font-semibold text-gray-800">
          <span className="hidden sm:inline">Welcome back, </span>
          <span className="text-accent-600">{user.name.split(" ")[0]}</span>
        </h2>
      </div>
      <div className="flex items-center gap-2 lg:gap-3">
        <NotificationBell />
        <div className="hidden sm:block h-5 w-px bg-gray-200" />
        <span className="hidden sm:inline rounded-md bg-navy-50 px-2 py-0.5 text-[10px] font-semibold text-navy-600 uppercase tracking-wide">
          {user.deptCode}
        </span>
        <span className={`hidden md:inline rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
          {user.roleName}
        </span>
        <Link
          href="/profile"
          className="hidden sm:inline text-sm font-medium text-gray-700 hover:text-accent-600 transition-colors"
        >
          {user.name}
        </Link>
        <button
          onClick={handleLogout}
          className="ml-1 flex items-center gap-1.5 rounded-lg px-2 lg:px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
