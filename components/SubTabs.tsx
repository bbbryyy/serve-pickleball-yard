"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pill tabs under a page title; a tab is active on its own path only (or its sub-paths when `prefix`). */
export function SubTabs({ tabs }: { tabs: { href: string; label: string; prefix?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const active = path === t.href || (t.prefix === true && path.startsWith(t.href + "/"));
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${active ? "bg-steel text-white" : "bg-white text-steel hover:bg-kitchen-light"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
