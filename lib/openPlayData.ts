import "server-only";
import { STATUS_TEXT } from "./booking";
import type { OpenPlayStatus } from "./openPlay";
import { createServiceClient } from "./supabase/server";

export type PublicSession = {
  code: string;
  service_date: string;
  starts_at: string;
  ends_at: string;
  court_names: string[];
  fee_per_player: number;
  max_players: number;
  spots_left: number;
  state: "open" | "full" | "closed" | "cancelled";
};

export type PublicOpenPlayPayment = {
  ref: string;
  code: string;
  service_date: string;
  starts_at: string;
  ends_at: string;
  court_names: string[];
  player_count: number;
  first_names: string[];
  total_amount: number;
  status: OpenPlayStatus;
  hold_expires_at: string | null;
  admin_note: string | null;
};

/** Live session details for the public payment link (never cached: spots change). */
export async function getOpenPlayPublic(code: string): Promise<PublicSession | null> {
  const { data } = await createServiceClient().rpc("get_open_play_public", { p_code: code });
  return (data as PublicSession[] | null)?.[0] ?? null;
}

export async function getOpenPlayPaymentPublic(ref: string): Promise<PublicOpenPlayPayment | null> {
  const { data } = await createServiceClient().rpc("get_open_play_payment_public", { p_ref: ref });
  return (data as PublicOpenPlayPayment[] | null)?.[0] ?? null;
}

export const OPEN_PLAY_STATUS_TEXT: Record<OpenPlayStatus, { label: string; cls: string; body: string }> = {
  ...STATUS_TEXT,
  pending_payment: { ...STATUS_TEXT.pending_payment, body: "Pay with GCash or Maya and upload your screenshot before your spots are released." },
  for_verification: { ...STATUS_TEXT.for_verification, body: "We got your payment proof. Once our staff confirm it, they'll accept you from the Reclub waiting list." },
  confirmed: { ...STATUS_TEXT.confirmed, body: "You're in. Our staff will accept you from the Reclub waiting list. Show this reference at the front desk." },
  expired: { ...STATUS_TEXT.expired, body: "The hold ended before we got your payment, so the spots were released. Open the session link again to pay." },
  cancelled: { ...STATUS_TEXT.cancelled, body: "This payment was cancelled." },
  refund_owed: { label: "Refund on the way", cls: "bg-surround/15 text-surround-dark", body: "This session was cancelled. Our staff will send your refund." },
  refunded: { label: "Refunded", cls: "bg-kitchen-light text-steel", body: "This session was cancelled and your payment was refunded." },
};
