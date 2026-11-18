"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Countdown } from "@/components/Countdown";
import type { StaffOpenPlayPayment } from "@/lib/openPlayAdmin";
import { formatPeso } from "@/lib/schedule";
import type { ActionResult } from "../actions";
import { extendOpenPlayHold, markRefunded, reviewOpenPlayPayment } from "../open-play-actions";

const METHOD: Record<string, string> = { gcash: "GCash", maya: "Maya", cash: "Cash" };

export function statusPill(p: Pick<StaffOpenPlayPayment, "status" | "source" | "holdLapsed">) {
  const s = p.holdLapsed ? "expired" : p.status;
  const map: Record<string, [string, string]> = {
    pending_payment: ["Paying", "bg-kitchen-light text-steel"],
    for_verification: ["Check payment", "bg-surround/20 text-surround-dark"],
    confirmed: [p.source === "walk_in" ? "Paid" : "Approved", "bg-ball/40 text-ball-dark"],
    rejected: ["Rejected", "bg-red-50 text-red-700"],
    expired: ["Expired", "bg-kitchen-light text-steel/70"],
    cancelled: ["Cancelled", "bg-kitchen-light text-steel/70"],
    refund_owed: ["Refund owed", "bg-surround/20 text-surround-dark"],
    refunded: ["Refunded", "bg-kitchen-light text-steel"],
  };
  const [label, cls] = map[s] ?? [s, "bg-kitchen-light text-steel"];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cls}`}>{label}</span>;
}

/** One open play payment with its staff actions. `showSession` adds the session line (payments list). */
export function OpenPlayPaymentRow({ p, showSession = false }: { p: StaffOpenPlayPayment; showSession?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [showProof, setShowProof] = useState(false);
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  const holding = p.status === "pending_payment";
  const expired = p.status === "expired" || p.holdLapsed;

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-[180px] flex-1">
          <p className="font-mono text-sm font-semibold text-steel">
            {p.source === "walk_in" ? "Walk-in" : p.ref}
            <span className="ml-2 rounded bg-ball/40 px-1.5 py-0.5 font-sans text-[10px] text-ball-dark uppercase">Open play</span>
          </p>
          <p className="mt-0.5 font-semibold text-steel">{p.names.join(", ")}</p>
          <p className="text-xs text-steel/60">
            {p.mobile ? <a href={`tel:${p.mobile}`} className="hover:underline">{p.mobile}</a> : "No mobile"}
            {p.email && <> · {p.email}</>}
          </p>
        </div>
        <div className="min-w-[150px] text-sm">
          {showSession && (
            <Link href={`/backoffice/open-play/${p.sessionId}`} className="block font-semibold text-court hover:underline">{p.sessionLabel}</Link>
          )}
          <p className="text-steel">
            {p.playerCount} × {formatPeso(p.total / p.playerCount)} = <span className="font-semibold">{formatPeso(p.total)}</span>
          </p>
          {p.paymentMethod && (
            <p className="text-steel/70">
              {METHOD[p.paymentMethod] ?? p.paymentMethod}
              {p.paymentRefNo && <> · #{p.paymentRefNo}</>}
            </p>
          )}
          {p.note && <p className="mt-1 text-xs text-steel/60">Note: {p.note}</p>}
        </div>
        <div className="min-w-[110px] text-sm">
          {statusPill(p)}
          {holding && !p.holdLapsed && p.holdExpiresAt && (
            <p className="mt-1 text-xs text-surround-dark">Hold ends in <Countdown until={p.holdExpiresAt} /></p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {p.proofUrl && (
            <button className="btn-ghost px-3 py-1.5" onClick={() => setShowProof((v) => !v)}>{showProof ? "Hide proof" : "View proof"}</button>
          )}
          {(["for_verification", "pending_payment"].includes(p.status) || expired) && (
            <button className="btn-lime px-3 py-1.5" disabled={pending} onClick={() => run(() => reviewOpenPlayPayment(p.id, "approve"))}>Approve</button>
          )}
          {holding && !expired && (
            <button className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => extendOpenPlayHold(p.id, 30))}>+30 min</button>
          )}
          {expired && (
            <button className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => extendOpenPlayHold(p.id, 30))}>Revive hold 30 min</button>
          )}
          {["for_verification", "pending_payment", "confirmed"].includes(p.status) && (
            <button className="btn-ghost px-3 py-1.5 text-red-700" disabled={pending} onClick={() => setRejecting((v) => !v)}>Reject…</button>
          )}
          {p.status === "refund_owed" && (
            <button className="btn-lime px-3 py-1.5" disabled={pending} onClick={() => run(() => markRefunded(p.id))}>Mark refunded</button>
          )}
        </div>
      </div>

      {showProof && p.proofUrl && (
        <a href={p.proofUrl} target="_blank" rel="noreferrer" className="mt-3 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.proofUrl} alt={`Payment proof for ${p.ref}`} className="max-h-96 rounded-lg border border-kitchen-light" />
        </a>
      )}

      {rejecting && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-kitchen-light pt-3">
          <input
            className="input max-w-md flex-1"
            placeholder="Reason shown to the player (e.g. amount doesn't match)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason for rejecting"
          />
          <button
            className="btn bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => reviewOpenPlayPayment(p.id, "reject", reason))}
          >
            Reject payment
          </button>
        </div>
      )}

      {(result.error || result.ok) && (
        <p role="status" className={`mt-2 text-sm ${result.error ? "text-red-700" : "text-court"}`}>{result.error ?? result.ok}</p>
      )}
    </li>
  );
}
