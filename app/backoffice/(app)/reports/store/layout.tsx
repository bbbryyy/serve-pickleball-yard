import { SubTabs } from "@/components/SubTabs";
import { requireAdmin } from "@/lib/auth";

export default async function StoreReportLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-3 font-display text-3xl font-semibold text-steel uppercase">Store Report</h1>
      <SubTabs
        tabs={[
          { href: "/backoffice/reports/store", label: "Report" },
          { href: "/backoffice/reports/store/closes", label: "Past closes" },
        ]}
      />
      {children}
    </div>
  );
}
