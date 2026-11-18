"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/backoffice/store", label: "Sell", admin: false },
  { href: "/backoffice/store/restock", label: "Restock", admin: false },
  { href: "/backoffice/store/close", label: "Close day", admin: false },
  { href: "/backoffice/store/items", label: "Items", admin: true },
  { href: "/backoffice/store/stock", label: "Stock", admin: true },
  { href: "/backoffice/store/closes", label: "Past closes", admin: true },
];

export function StoreTabs({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto">
      {TABS.filter((t) => isAdmin || !t.admin).map((t) => {
        const active = t.href === "/backoffice/store" ? path === t.href : path.startsWith(t.href);
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
