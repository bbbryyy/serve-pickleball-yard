"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/backoffice", label: "Bookings", admin: false },
  { href: "/backoffice/schedule", label: "Schedule", admin: false },
  { href: "/backoffice/open-play", label: "Open Play", admin: false },
  { href: "/backoffice/store", label: "Store", admin: false },
  { href: "/backoffice/reports/sales", label: "Sales", admin: true },
  { href: "/backoffice/reports/analytics", label: "Analytics", admin: true },
  { href: "/backoffice/reports/store", label: "Store report", admin: true },
  { href: "/backoffice/settings", label: "Settings", admin: true },
  { href: "/backoffice/users", label: "Users", admin: true },
];

export function BackofficeNav({ isAdmin, pendingCount, storeAlerts = 0 }: { isAdmin: boolean; pendingCount: number; storeAlerts?: number }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.filter((i) => isAdmin || !i.admin).map((i) => {
        const active = i.href === "/backoffice" ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${
              active ? "bg-court text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {i.label}
            {i.href === "/backoffice" && pendingCount > 0 && (
              <span className="rounded-full bg-surround px-2 text-xs text-white">{pendingCount}</span>
            )}
            {i.href === "/backoffice/store" && storeAlerts > 0 && (
              <span className="rounded-full bg-surround px-2 text-xs text-white" title="Low stock and days not closed">{storeAlerts}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
