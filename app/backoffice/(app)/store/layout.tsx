import { requireStaff } from "@/lib/auth";
import { StoreTabs } from "./StoreTabs";

export default async function StoreLayout({ children }: LayoutProps<"/backoffice/store">) {
  const user = await requireStaff();
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-3 font-display text-3xl font-semibold text-steel uppercase">Store</h1>
      <StoreTabs isAdmin={user.role === "admin"} />
      {children}
    </div>
  );
}
