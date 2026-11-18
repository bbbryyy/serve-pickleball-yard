"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../../../actions";
import { correctStock } from "../../../store-actions";

const REASONS = ["expired", "damaged", "given away", "count fix"] as const;

export function CorrectStock({ items, initial }: { items: { id: string; name: string; onHand: number }[]; initial?: string }) {
  const [itemId, setItemId] = useState(initial ?? items[0].id);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("count fix");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const item = items.find((i) => i.id === itemId)!;
  const n = Number(qty) || 0;

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await correctStock(itemId, Number(qty), reason); setResult(r); if (r.ok) setQty(""); }); }}>
      <select className="input" aria-label="Item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.onHand} in stock)</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="cs-qty">Add or remove</label>
          <input id="cs-qty" className="input" inputMode="numeric" placeholder="-2" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))} required />
        </div>
        <div>
          <label className="label" htmlFor="cs-reason">Reason</label>
          <select id="cs-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {REASONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <p className="text-sm text-steel">Stock after: <strong>{item.onHand + n}</strong>{n < 0 && reason !== "count fix" ? " · counted as a loss" : ""}</p>
      <button className="btn-ghost w-full" disabled={pending}>{pending ? "Saving…" : "Save correction"}</button>
      {(result.error || result.ok) && <p role="status" className={`text-sm ${result.error ? "text-red-700" : "text-court"}`}>{result.error ?? result.ok}</p>}
    </form>
  );
}
