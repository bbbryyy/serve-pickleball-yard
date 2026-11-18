import { SubTabs } from "@/components/SubTabs";
import { requireStaff } from "@/lib/auth";

export default async function PosLayout({ children }: LayoutProps<"/backoffice/store">) {
  await requireStaff();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-3 font-display text-3xl font-semibold text-steel uppercase">POS</h1>
      <SubTabs
        tabs={[
          { href: "/backoffice/store", label: "Sell" },
          { href: "/backoffice/store/cash-out", label: "Cash out" },
          { href: "/backoffice/store/close", label: "Close day" },
        ]}
      />
      {children}
    </div>
  );
}
