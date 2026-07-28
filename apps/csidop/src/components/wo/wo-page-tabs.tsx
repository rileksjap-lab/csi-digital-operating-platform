"use client";

import Link from "next/link";
import type { SVGProps } from "react";

function ListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M4 5.5h12M4 10h12M4 14.5h8" strokeLinecap="round" />
    </svg>
  );
}

function TargetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

const TABS = [
  { key: "wo" as const, href: "/wo", label: "Work Orders", Icon: ListIcon },
  { key: "engagement" as const, href: "/wo/engagement", label: "Engagement Overview", Icon: TargetIcon },
];

export default function WoPageTabs({ active }: { active: "wo" | "engagement" }) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-200">
      {TABS.map(({ key, href, label, Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href}
            className={`flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${
              isActive
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
