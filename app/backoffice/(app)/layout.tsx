import Link from "next/link";
import { BackofficeDink } from "@/components/BackofficeDink";
import { BackofficeNav } from "@/components/BackofficeNav";
import { requireStaff } from "@/lib/auth";
import { getStoreAlerts } from "@/lib/storeData";
import { createUserClient } from "@/lib/supabase/server";
import { signOut } from "../actions";

export default async function BackofficeLayout({ children }: LayoutProps<"/backoffice">) {
  const user = await requireStaff();
  const supabase = await createUserClient();
  const [{ count: bookingsToCheck }, { count: openPlayToCheck }, store] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "for_verification"),
    supabase.from("open_play_payments").select("id", { count: "exact", head: true }).eq("status", "for_verification"),
    getStoreAlerts(),
  ]);
  const count = (bookingsToCheck ?? 0) + (openPlayToCheck ?? 0);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="bg-steel p-3 text-white lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:p-4">
        <div className="mb-3 flex items-center justify-between lg:mb-6 lg:block">
          <Link href="/" className="font-display text-lg leading-tight uppercase">
            <span className="text-[#6fa8ff]">Serve</span> backoffice
          </Link>
          <div className="text-xs text-white/60 lg:mt-1">
            {user.fullName} · <span className="font-semibold text-ball uppercase">{user.role}</span>
          </div>
        </div>
        {process.env.AGENT_ENABLED !== "false" && <BackofficeDink firstName={user.fullName.split(" ")[0]} isAdmin={user.role === "admin"} />}
        <BackofficeNav isAdmin={user.role === "admin"} pendingCount={count} posAlerts={store.unclosed.length + store.late.length} lowStock={user.role === "admin" ? store.low : 0} />
        <form action={signOut} className="mt-3 lg:absolute lg:bottom-4 lg:left-4 lg:right-4">
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white">Sign out</button>
        </form>
      </aside>
      <main className="bo-main @container min-w-0 flex-1 bg-paper p-4 lg:p-8">{children}</main>
    </div>
  );
}
