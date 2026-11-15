import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { groupSlots } from "@/lib/schedule";
import { getSiteSettings } from "@/lib/settings";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { BookingRow, type QueueBooking } from "./BookingRow";

const isPast = (d: Date) => d.getTime() < Date.now();

const TABS = [
  { key: "for_verification", label: "For verification" },
  { key: "pending_payment", label: "Waiting for payment" },
  { key: "confirmed", label: "Confirmed" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default async function QueuePage({ searchParams }: PageProps<"/backoffice">) {
  await requireStaff();
  const sp = await searchParams;
  const status = TABS.find((t) => t.key === sp.status)?.key ?? "for_verification";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await createUserClient();
  const { rules } = await getSiteSettings();

  let query = supabase
    .from("bookings")
    .select("id, ref, player_name, mobile, email, hours, total_amount, status, source, hold_expires_at, payment_method, payment_ref_no, proof_path, proof_uploaded_at, admin_note, created_at, courts(name), booking_slots(slot_start)")
    .eq("status", status);
  if (q) query = query.or(`ref.ilike.%${q.replace(/[%,()]/g, "")}%,player_name.ilike.%${q.replace(/[%,()]/g, "")}%,mobile.ilike.%${q.replace(/[%,()]/g, "")}%`);
  query =
    status === "for_verification"
      ? query.order("proof_uploaded_at", { ascending: true })
      : status === "pending_payment"
        ? query.order("hold_expires_at", { ascending: true })
        : query.order("created_at", { ascending: false });
  const [{ data, error }, counts] = await Promise.all([
    query.limit(100),
    supabase.from("bookings").select("status").in("status", ["for_verification", "pending_payment"]),
  ]);
  if (error) throw new Error(error.message);
  const countOf = (s: string) => counts.data?.filter((r) => r.status === s).length ?? 0;

  // private proof images: short-lived signed URLs (server-side, after the staff check)
  const storage = createServiceClient().storage.from("payment-proofs");
  const rows: QueueBooking[] = await Promise.all(
    (data ?? []).map(async (b) => {
      const slotStarts = (b.booking_slots as { slot_start: string }[]).map((s) => new Date(s.slot_start));
      const proofUrl = b.proof_path ? (await storage.createSignedUrl(b.proof_path, 600)).data?.signedUrl ?? null : null;
      const firstSlot = slotStarts.sort((a, z) => a.getTime() - z.getTime())[0];
      return {
        id: b.id,
        ref: b.ref,
        playerName: b.player_name,
        mobile: b.mobile,
        email: b.email,
        court: (b.courts as unknown as { name: string }).name,
        slots: groupSlots(slotStarts, rules),
        firstSlotPast: firstSlot ? isPast(firstSlot) : false,
        hours: b.hours,
        total: b.total_amount,
        status: b.status,
        source: b.source,
        holdExpiresAt: b.hold_expires_at,
        paymentMethod: b.payment_method,
        paymentRefNo: b.payment_ref_no,
        proofUrl,
        proofUploadedAt: b.proof_uploaded_at,
        note: b.admin_note,
        createdAt: b.created_at,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-6xl">
      {sp.denied && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">That page is for admins only.</p>
      )}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-steel uppercase">Bookings</h1>
        <form className="flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Ref, name, or mobile" className="input w-56" />
          <button className="btn-ghost">Search</button>
        </form>
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const n = t.key === "for_verification" || t.key === "pending_payment" ? countOf(t.key) : null;
          return (
            <Link
              key={t.key}
              href={`/backoffice?status=${t.key}`}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${
                t.key === status ? "bg-steel text-white" : "bg-white text-steel hover:bg-kitchen-light"
              }`}
            >
              {t.label}
              {n ? <span className="ml-1.5 rounded-full bg-surround px-1.5 text-xs text-white">{n}</span> : null}
            </Link>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-steel/60">
          {status === "for_verification" ? "No payments to check right now." : "No bookings here."}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => (
            <BookingRow key={b.id} b={b} />
          ))}
        </ul>
      )}
    </div>
  );
}
