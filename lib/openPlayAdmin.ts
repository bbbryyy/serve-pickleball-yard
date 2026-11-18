import "server-only";
import { formatSessionTime } from "./openPlay";
import type { BookingRules } from "./schedule";
import { createServiceClient } from "./supabase/server";

export type StaffOpenPlayPayment = {
  id: string;
  ref: string;
  sessionId: string;
  sessionLabel: string;
  names: string[];
  mobile: string | null;
  email: string | null;
  playerCount: number;
  total: number;
  status: string;
  source: string;
  holdExpiresAt: string | null;
  /** waiting for payment but the hold has run out (cron hasn't marked it yet) */
  holdLapsed: boolean;
  paymentMethod: string | null;
  paymentRefNo: string | null;
  proofUrl: string | null;
  note: string | null;
  createdAt: string;
};

/** Columns to select from open_play_payments for staff views (RLS: staff only). */
export const PAYMENT_COLUMNS =
  "id, ref, session_id, player_count, total_amount, mobile, email, status, source, hold_expires_at, payment_method, payment_ref_no, proof_path, admin_note, created_at, proof_uploaded_at, open_play_players(position, name), open_play_sessions(starts_at, ends_at)";

type Row = {
  id: string;
  ref: string;
  session_id: string;
  player_count: number;
  total_amount: number;
  mobile: string | null;
  email: string | null;
  status: string;
  source: string;
  hold_expires_at: string | null;
  payment_method: string | null;
  payment_ref_no: string | null;
  proof_path: string | null;
  admin_note: string | null;
  created_at: string;
  open_play_players: { position: number; name: string }[];
  open_play_sessions: { starts_at: string; ends_at: string };
};

/** Shape rows for the staff UI, with short-lived signed URLs for proof screenshots. */
export async function toStaffPayments(rows: unknown[], rules: BookingRules): Promise<StaffOpenPlayPayment[]> {
  const storage = createServiceClient().storage.from("payment-proofs");
  const now = Date.now();
  return Promise.all(
    (rows as Row[]).map(async (p) => ({
      id: p.id,
      ref: p.ref,
      sessionId: p.session_id,
      sessionLabel: formatSessionTime(new Date(p.open_play_sessions.starts_at), new Date(p.open_play_sessions.ends_at), rules),
      names: [...p.open_play_players].sort((a, b) => a.position - b.position).map((x) => x.name),
      mobile: p.mobile,
      email: p.email,
      playerCount: p.player_count,
      total: p.total_amount,
      status: p.status,
      source: p.source,
      holdExpiresAt: p.hold_expires_at,
      holdLapsed: p.status === "pending_payment" && !!p.hold_expires_at && Date.parse(p.hold_expires_at) < now,
      paymentMethod: p.payment_method,
      paymentRefNo: p.payment_ref_no,
      proofUrl: p.proof_path ? ((await storage.createSignedUrl(p.proof_path, 600)).data?.signedUrl ?? null) : null,
      note: p.admin_note,
      createdAt: p.created_at,
    })),
  );
}
