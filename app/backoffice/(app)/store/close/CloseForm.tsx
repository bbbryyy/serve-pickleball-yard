"use client";

import { useState, useTransition } from "react";
import { formatPeso } from "@/lib/schedule";
import { closeDiff, type Money3 } from "@/lib/store";
import type { ActionResult } from "../../../actions";
import { closeDay } from "../../../store-actions";

type Src = { cash?: number; gcash?: number; maya?: number };
export type Expected = Money3 & {
  breakdown: { store: Src; court_walk_in: Src; open_play_walk_in: Src; online_court: Src; online_open_play: Src; cash_outs: number };
};

const SOURCES: [keyof Omit<Expected["breakdown"], "cash_outs">, string][] = [
  ["store", "Store"],
  ["court_walk_in", "Court walk-ins"],
  ["open_play_walk_in", "Open play walk-ins"],
  ["online_court", "Online court bookings"],
  ["online_open_play", "Online open play"],
];

function parts(e: Expected, m: keyof Money3) {
  const out = SOURCES.filter(([k]) => (e.breakdown[k][m] ?? 0) > 0).map(([k, l]) => `${l} ${formatPeso(e.breakdown[k][m] ?? 0)}`);
  if (m === "cash" && e.breakdown.cash_outs > 0) out.push(`minus cash out ${formatPeso(e.breakdown.cash_outs)}`);
  return out.join(" + ").replace("+ minus", "−") || "Nothing yet";
}

const diffText = (n: number) => (n === 0 ? "₱0" : n > 0 ? `+${formatPeso(n)}` : `−${formatPeso(-n)}`);
const diffCls = (n: number) => (n === 0 ? "text-ball-dark" : "text-red-700");

export function CloseForm({ date, label, expected, closed, close }: { date: string; label: string; expected: Expected; closed: boolean; close: Record<string, unknown> | null }) {
  const [counted, setCounted] = useState<Record<keyof Money3, string>>({ cash: "", gcash: "", maya: "" });
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const num = (m: keyof Money3) => (counted[m] === "" ? null : Number(counted[m]));
  const methods: [keyof Money3, string][] = [["cash", "Cash"], ["gcash", "GCash"], ["maya", "Maya"]];

  if (closed && close) {
    const c = close as Record<string, number | string | null>;
    const exp = { cash: Number(c.expected_cash), gcash: Number(c.expected_gcash), maya: Number(c.expected_maya) };
    const got = { cash: Number(c.counted_cash), gcash: Number(c.counted_gcash), maya: Number(c.counted_maya) };
    const d = closeDiff(exp, got);
    return (
      <div className="card max-w-xl p-5">
        <h2 className="font-display text-xl font-semibold text-steel uppercase">{label} · closed</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-xs text-steel/60"><tr><th className="text-left">Method</th><th className="text-right">Expected</th><th className="text-right">Counted</th><th className="text-right">Difference</th></tr></thead>
          <tbody>
            {methods.map(([m, l]) => (
              <tr key={m} className="border-t border-kitchen-light"><td className="py-1.5">{l}</td><td className="text-right">{formatPeso(exp[m])}</td><td className="text-right">{formatPeso(got[m])}</td><td className={`text-right font-semibold ${diffCls(d[m])}`}>{diffText(d[m])}</td></tr>
            ))}
          </tbody>
        </table>
        {c.note ? <p className="mt-3 text-sm text-steel/70">Note: {String(c.note)}</p> : null}
        <p className="mt-3 text-xs text-steel/60">To add a missed sale or fix a mistake, an admin can reopen this day from Past closes.</p>
      </div>
    );
  }

  return (
    <form
      className="card max-w-xl space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await closeDay({ date, cash: Number(counted.cash), gcash: Number(counted.gcash), maya: Number(counted.maya), note })));
      }}
    >
      <h2 className="font-display text-xl font-semibold text-steel uppercase">Close day · {label}</h2>
      <p className="text-sm text-steel/70">Count the drawer and check the GCash and Maya apps, then enter what you have. Don&apos;t include the change fund that stays in the drawer.</p>
      <table className="w-full text-sm">
        <thead className="text-xs text-steel/60"><tr><th className="text-left">Method</th><th className="text-right">Expected</th><th className="text-right">Counted</th><th className="text-right">Difference</th></tr></thead>
        <tbody>
          {methods.map(([m, l]) => {
            const v = num(m);
            const d = v === null ? null : v - expected[m];
            return (
              <tr key={m} className="border-t border-kitchen-light align-top">
                <td className="py-2">
                  <p className="font-semibold">{l}</p>
                  <p className="text-xs text-steel/60">{parts(expected, m)}</p>
                </td>
                <td className="py-2 text-right">{formatPeso(expected[m])}</td>
                <td className="py-2 text-right">
                  <input className="input ml-auto w-24 text-right" inputMode="numeric" aria-label={`Counted ${l}`} value={counted[m]} onChange={(e) => setCounted({ ...counted, [m]: e.target.value.replace(/\D/g, "") })} required />
                </td>
                <td className={`py-2 text-right font-semibold ${d === null ? "text-steel/40" : diffCls(d)}`}>{d === null ? "—" : diffText(d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <input className="input" placeholder="Note (e.g. gave ₱20 change from own pocket)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      <button className="btn-lime w-full py-3" disabled={pending}>{pending ? "Closing…" : "Close day"}</button>
      {(result.error || result.ok) && <p role="status" className={`text-sm ${result.error ? "text-red-700" : "text-court"}`}>{result.error ?? result.ok}</p>}
    </form>
  );
}
