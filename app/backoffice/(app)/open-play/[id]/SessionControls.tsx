"use client";

import { useState, useTransition } from "react";
import { maxGroupSize } from "@/lib/openPlay";
import type { ActionResult } from "../../../actions";
import { addCourt, addWalkIns, cancelSession } from "../../../open-play-actions";

function Result({ r }: { r: ActionResult }) {
  if (!r.error && !r.ok) return null;
  return <p role="status" className={`text-sm ${r.error ? "text-red-700" : "text-court"}`}>{r.error ?? r.ok}</p>;
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <code className="min-w-0 truncate rounded-lg border border-kitchen bg-white px-3 py-1.5 text-sm text-court">{url}</code>
      <button
        type="button"
        className="btn-ghost px-3 py-1.5"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function WalkInForm({ sessionId, spotsLeft }: { sessionId: string; spotsLeft: number }) {
  const max = maxGroupSize(spotsLeft);
  const [count, setCount] = useState(1);
  const [names, setNames] = useState<string[]>([""]);
  const [method, setMethod] = useState<"cash" | "gcash" | "maya">("cash");
  const [mobile, setMobile] = useState("");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const resize = (n: number) => {
    setCount(n);
    setNames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ""));
  };
  if (max === 0) return <p className="text-sm text-steel/70">This session is full, so walk-ins can&apos;t be added.</p>;
  const n = Math.min(count, max);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addWalkIns({ sessionId, names: names.slice(0, n), paymentMethod: method, mobile });
          setResult(r);
          if (r.ok) {
            resize(1);
            setNames([""]);
            setMobile("");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="wi-count">Players</label>
          <select id="wi-count" className="input w-24" value={n} onChange={(e) => resize(Number(e.target.value))}>
            {Array.from({ length: max }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="wi-method">Paid with</label>
          <select id="wi-method" className="input w-32" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label" htmlFor="wi-mobile">Mobile {method === "cash" ? "(optional for cash)" : ""}</label>
          <input id="wi-mobile" className="input" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="0917 123 4567" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: n }, (_, i) => (
          <input
            key={i}
            className="input"
            required
            minLength={2}
            maxLength={60}
            aria-label={`Walk-in player ${i + 1} name`}
            placeholder={`Player ${i + 1} name`}
            value={names[i] ?? ""}
            onChange={(e) => setNames((p) => Object.assign([...p], { [i]: e.target.value }))}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-lime" disabled={pending}>{pending ? "Adding…" : `Add ${n} player${n === 1 ? "" : "s"}`}</button>
        <Result r={result} />
      </div>
    </form>
  );
}

export function AddCourt({ sessionId, courts }: { sessionId: string; courts: { id: number; name: string }[] }) {
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  if (courts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {courts.map((c) => (
        <button key={c.id} type="button" className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => start(async () => setResult(await addCourt(sessionId, c.id)))}>
          Add {c.name}
        </button>
      ))}
      <Result r={result} />
    </div>
  );
}

export function CancelSession({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="btn-ghost px-3 py-1.5 text-red-700" onClick={() => setOpen(true)}>
        Cancel session…
      </button>
    );
  return (
    <div className="w-full space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-800">
        Cancelling frees the court hours. Players who already paid will show as Refund owed until you mark them refunded.
      </p>
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-md flex-1" placeholder="Reason (e.g. typhoon signal no. 2)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for cancelling" />
        <button
          type="button"
          className="btn bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
          disabled={pending || !reason.trim()}
          onClick={() => start(async () => setResult(await cancelSession(sessionId, reason)))}
        >
          Cancel session
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setOpen(false)}>Keep session</button>
      </div>
      <Result r={result} />
    </div>
  );
}
