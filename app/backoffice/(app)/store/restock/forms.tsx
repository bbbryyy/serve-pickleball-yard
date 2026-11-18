"use client";

import { useState, useTransition } from "react";
import { formatPeso } from "@/lib/schedule";
import type { ActionResult } from "../../../actions";
import { addStock, cashOut } from "../../../store-actions";

const PAID_FROM = [
  ["owner", "Owner"],
  ["drawer", "Drawer"],
  ["gcash", "GCash"],
  ["maya", "Maya"],
] as const;

function Result({ r }: { r: ActionResult }) {
  if (!r.error && !r.ok) return null;
  return <p role="status" className={`text-sm ${r.error ? "text-red-700" : "text-court"}`}>{r.error ?? r.ok}</p>;
}

export function RestockForm({ items, isAdmin }: { items: { id: string; name: string; onHand: number; avgCost: number | null }[]; isAdmin: boolean }) {
  const [itemId, setItemId] = useState(items[0].id);
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [paidFrom, setPaidFrom] = useState<(typeof PAID_FROM)[number][0]>("owner");
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const item = items.find((i) => i.id === itemId)!;
  const n = Number(qty) || 0;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addStock({ itemId, qty: Number(qty), totalCost: Number(total), paidFrom: opening ? "owner" : paidFrom, opening });
          setResult(r);
          if (r.ok) { setQty(""); setTotal(""); }
        });
      }}
    >
      <div>
        <label className="label" htmlFor="rs-item">Item</label>
        <select id="rs-item" className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.onHand} in stock)</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="rs-qty">Quantity</label>
          <input id="rs-qty" className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="24" required />
        </div>
        <div>
          <label className="label" htmlFor="rs-total">Total paid (₱)</label>
          <input id="rs-total" className="input" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))} placeholder="720" required />
        </div>
      </div>
      {!opening && (
        <fieldset>
          <legend className="label">Paid from</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {PAID_FROM.map(([v, l]) => (
              <button key={v} type="button" onClick={() => setPaidFrom(v)} aria-pressed={paidFrom === v}
                className={`rounded-full border px-2 py-1.5 text-sm font-semibold ${paidFrom === v ? "border-court bg-court text-white" : "border-kitchen bg-white text-steel"}`}>
                {l}
              </button>
            ))}
          </div>
          {paidFrom === "drawer" && <p className="mt-1 text-xs text-steel/60">This amount is taken out of today&apos;s expected cash.</p>}
        </fieldset>
      )}
      {isAdmin && (
        <label className="flex items-center gap-2 text-sm text-steel">
          <input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} className="accent-court" />
          Opening stock (already on the shelf; enter your best estimate of what it cost)
        </label>
      )}
      <p className="text-sm text-steel">
        Stock after: <strong>{item.onHand + n}</strong>
        {isAdmin && item.avgCost !== null && <span className="text-steel/60"> · average cost now {formatPeso(Math.round(item.avgCost * 100) / 100)}</span>}
      </p>
      <button className="btn-lime w-full" disabled={pending}>{pending ? "Saving…" : opening ? "Save opening stock" : "Save restock"}</button>
      <Result r={result} />
    </form>
  );
}

export function CashOutForm() {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await cashOut(Number(amount), reason);
          setResult(r);
          if (r.ok) { setAmount(""); setReason(""); }
        });
      }}
    >
      <div className="grid grid-cols-[110px_1fr] gap-2">
        <input className="input" inputMode="numeric" aria-label="Amount in pesos" placeholder="₱50" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
        <input className="input" aria-label="Reason" placeholder="Ice" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} maxLength={120} />
      </div>
      <button className="btn-ghost w-full" disabled={pending}>{pending ? "Saving…" : "Record cash out"}</button>
      <Result r={result} />
    </form>
  );
}
