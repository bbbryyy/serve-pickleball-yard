import "server-only";
import { createServiceClient } from "./supabase/server";

export type PublicBooking = {
  ref: string;
  court_id: number;
  court_name: string;
  player_name: string;
  hours: number;
  total_amount: number;
  status: "pending_payment" | "for_verification" | "confirmed" | "rejected" | "expired" | "cancelled";
  hold_expires_at: string | null;
  payment_method: string | null;
  admin_note: string | null;
  slots: string[];
};

export async function getPublicBooking(ref: string): Promise<PublicBooking | null> {
  const { data } = await createServiceClient().rpc("get_booking_public", { p_ref: ref });
  return (data as PublicBooking[] | null)?.[0] ?? null;
}

export const STATUS_TEXT: Record<PublicBooking["status"], { label: string; cls: string; body: string }> = {
  pending_payment: { label: "Waiting for payment", cls: "bg-surround/15 text-surround-dark", body: "Pay with GCash or Maya and upload your screenshot before your hold ends." },
  for_verification: { label: "Checking your payment", cls: "bg-court/10 text-court", body: "We got your payment proof. Our staff will confirm your booking shortly." },
  confirmed: { label: "Confirmed", cls: "bg-ball/40 text-ball-dark", body: "You're all set. Show this booking reference at the front desk." },
  rejected: { label: "Payment not accepted", cls: "bg-red-50 text-red-700", body: "We couldn't verify your payment. Contact us or book again." },
  expired: { label: "Hold expired", cls: "bg-kitchen-light text-steel", body: "The hold ended before we got your payment, so the hours were released. Book again to continue." },
  cancelled: { label: "Cancelled", cls: "bg-kitchen-light text-steel", body: "This booking was cancelled." },
};
