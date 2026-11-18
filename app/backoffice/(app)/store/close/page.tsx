import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatServiceDate } from "@/lib/schedule";
import { getStoreDay } from "@/lib/storeData";
import { createUserClient } from "@/lib/supabase/server";
import { CloseForm, type Expected, type Late } from "./CloseForm";

export default async function ClosePage({ searchParams }: PageProps<"/backoffice/store/close">) {
  await requireStaff();
  const sp = await searchParams;
  const today = await getStoreDay();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const supabase = await createUserClient();
  const [{ data: expected, error }, { data: status }, { data: unclosed }, { data: late }] = await Promise.all([
    supabase.rpc("store_day_expected", { p_date: date }),
    supabase.rpc("store_day_status", { p_date: date }),
    supabase.rpc("store_unclosed_days"),
    supabase.rpc("store_late_days"),
  ]);
  if (error) throw new Error(error.message);
  const st = status as { closed: boolean; close: Record<string, unknown> | null; late: Late | null };
  const missed = ((unclosed ?? []) as string[]).filter((d) => d !== date);
  const lateDays = ((late ?? []) as string[]).filter((d) => d !== date);

  return (
    <div className="space-y-4">
      {missed.length > 0 && (
        <p className="rounded-lg bg-surround/15 px-4 py-3 text-sm text-surround-dark">
          Not closed yet:{" "}
          {missed.map((d, i) => (
            <span key={d}>{i > 0 && ", "}<Link className="underline" href={`/backoffice/store/close?date=${d}`}>{formatServiceDate(d)}</Link></span>
          ))}
        </p>
      )}
      {lateDays.length > 0 && (
        <p className="rounded-lg bg-surround/15 px-4 py-3 text-sm text-surround-dark">
          Money was recorded after closing:{" "}
          {lateDays.map((d, i) => (
            <span key={d}>{i > 0 && ", "}<Link className="underline" href={`/backoffice/store/close?date=${d}`}>{formatServiceDate(d)}</Link></span>
          ))}
        </p>
      )}
      <CloseForm key={date} date={date} label={formatServiceDate(date)} isToday={date === today} expected={expected as Expected} closed={st.closed} close={st.close} late={st.late} />
    </div>
  );
}
