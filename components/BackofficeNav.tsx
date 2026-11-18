"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; admin: boolean; badge?: "payments" | "pos" | "inventory" };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Pickleball",
    items: [
      { href: "/backoffice", label: "Bookings", admin: false, badge: "payments" },
      { href: "/backoffice/schedule", label: "Schedule", admin: false },
      { href: "/backoffice/open-play", label: "Open Play", admin: false },
      { href: "/backoffice/reports/sales", label: "Sales", admin: true },
      { href: "/backoffice/reports/analytics", label: "Analytics", admin: true },
      { href: "/backoffice/settings", label: "Settings", admin: true },
    ],
  },
  {
    label: "Store",
    items: [
      { href: "/backoffice/store", label: "POS", admin: false, badge: "pos" },
      { href: "/backoffice/inventory", label: "Inventory", admin: true, badge: "inventory" },
      { href: "/backoffice/reports/store", label: "Store Report", admin: true },
    ],
  },
  { label: "Users", items: [{ href: "/backoffice/users", label: "Users", admin: true }] },
];

export function BackofficeNav({
  isAdmin,
  pendingCount,
  posAlerts = 0,
  lowStock = 0,
}: {
  isAdmin: boolean;
  pendingCount: number;
  posAlerts?: number;
  lowStock?: number;
}) {
  const path = usePathname();
  const count = { payments: pendingCount, pos: posAlerts, inventory: lowStock };
  const title = { payments: "Payments to check", pos: "Days not closed, or money recorded after a close", inventory: "Items running low" };
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => isAdmin || !i.admin);
        if (items.length === 0) return null;
        return (
          <div key={g.label} className="flex gap-1 lg:mb-3 lg:flex-col">
            <p className="hidden px-3 pt-1 pb-1 text-[11px] font-semibold tracking-wider text-white/40 uppercase lg:block">{g.label}</p>
            {items.map((i) => {
              const active = i.href === "/backoffice" ? path === i.href : path === i.href || path.startsWith(i.href + "/");
              const n = i.badge ? count[i.badge] : 0;
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${
                    active ? "bg-court text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {i.label}
                  {i.badge && n > 0 && (
                    <span className="rounded-full bg-surround px-2 text-xs text-white" title={title[i.badge]}>{n}</span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
