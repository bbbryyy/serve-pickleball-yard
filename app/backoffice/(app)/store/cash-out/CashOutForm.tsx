"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../../../actions";
import { cashOut } from "../../../store-actions";

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
      {(result.error || result.ok) && <p role="status" className={`text-sm ${result.error ? "text-red-700" : "text-court"}`}>{result.error ?? result.ok}</p>}
    </form>
  );
}
