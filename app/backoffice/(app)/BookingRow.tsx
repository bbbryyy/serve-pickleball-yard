"use client";

import { useState, useTransition } from "react";
import { Countdown } from "@/components/Countdown";
import { formatPeso } from "@/lib/schedule";
import { extendHold, reviewBooking, type ActionResult } from "../actions";

export type QueueBooking = {
  id: string;
  ref: string;
  playerName: string;
  mobile: string;
  email: string | null;
  court: string;
  slots: string[];
  firstSlotPast: boolean;
  hours: number;
  total: number;
  status: string;
  source: string;
  holdExpiresAt: string | null;
  paymentMethod: string | null;
  paymentRefNo: string | null;
  proofUrl: string | null;
  proofUploadedAt: string | null;
  note: string | null;
  createdAt: string;
};

const METHOD: Record<string, string> = { gcash: "GCash", maya: "Maya", cash: "Cash" };

export function BookingRow({ b }: { b: QueueBooking }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [showProof, setShowProof] = useState(false);
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[180px] flex-1">
          <p className="font-mono text-sm font-semibold text-steel">
            {b.ref}
            {b.source === "walk_in" && <span className="ml-2 rounded bg-kitchen-light px-1.5 py-0.5 font-sans text-[10px] uppercase">Walk-in</span>}
          </p>
          <p className="mt-0.5 font-semibold text-steel">{b.playerName}</p>
          <p className="text-xs text-steel/60">
            <a href={`tel:${b.mobile}`} className="hover:underline">{b.mobile}</a>
            {b.email && <> · {b.email}</>}
          </p>
        </div>
        <div className="min-w-[200px] flex-1 text-sm">
          <p className="font-semibold text-court">{b.court}</p>
          {b.slots.map((s) => (
            <p key={s} className="text-steel">{s}</p>
          ))}
        </div>
        <div className="min-w-[150px] text-sm">
          <p className="font-display text-xl font-semibold text-steel uppercase">{formatPeso(b.total)}</p>
          {b.paymentMethod && (
            <p className="text-steel/70">
              {METHOD[b.paymentMethod] ?? b.paymentMethod}
              {b.paymentRefNo && <> · #{b.paymentRefNo}</>}
            </p>
          )}
          {b.status === "pending_payment" && b.holdExpiresAt && (
            <p className="text-surround-dark">Hold ends in <Countdown until={b.holdExpiresAt} /></p>
          )}
          {b.note && <p className="mt-1 text-xs text-steel/60">Note: {b.note}</p>}
        </div>

        <div className="flex flex-wrap items-start gap-2">
          {b.proofUrl && (
            <button className="btn-ghost px-3 py-1.5" onClick={() => setShowProof((v) => !v)}>
              {showProof ? "Hide proof" : "View proof"}
            </button>
          )}
          {(b.status === "for_verification" || b.status === "pending_payment") && (
            <button className="btn-lime px-3 py-1.5" disabled={pending} onClick={() => run(() => reviewBooking(b.id, "approve"))}>
              Approve
            </button>
          )}
          {b.status === "pending_payment" && (
            <>
              <button className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => extendHold(b.id, 30))}>+30 min</button>
              <button className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => extendHold(b.id, 120))}>+2 hrs</button>
            </>
          )}
          {b.status === "expired" && !b.firstSlotPast && (
            <button className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => extendHold(b.id, 30))}>
              Revive hold 30 min
            </button>
          )}
          {["for_verification", "pending_payment", "confirmed"].includes(b.status) && (
            <button className="btn-ghost px-3 py-1.5 text-red-700" disabled={pending} onClick={() => setRejecting((v) => !v)}>
              {b.status === "confirmed" ? "Cancel…" : "Reject…"}
            </button>
          )}
        </div>
      </div>

      {showProof && b.proofUrl && (
        <a href={b.proofUrl} target="_blank" rel="noreferrer" className="mt-3 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.proofUrl} alt={`Payment proof for ${b.ref}`} className="max-h-96 rounded-lg border border-kitchen-light" />
        </a>
      )}

      {rejecting && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-kitchen-light pt-3">
          <input
            className="input max-w-md flex-1"
            placeholder={b.status === "confirmed" ? "Reason for cancelling" : "Reason shown to the player (e.g. amount doesn't match)"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="btn bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => reviewBooking(b.id, b.status === "confirmed" ? "cancel" : "reject", reason))}
          >
            {b.status === "confirmed" ? "Cancel booking" : "Reject payment"}
          </button>
        </div>
      )}

      {(result.error || result.ok) && (
        <p role="status" className={`mt-2 text-sm ${result.error ? "text-red-700" : "text-court"}`}>{result.error ?? result.ok}</p>
      )}
    </li>
  );
}
