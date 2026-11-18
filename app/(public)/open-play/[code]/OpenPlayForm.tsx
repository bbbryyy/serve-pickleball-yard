"use client";

import { useActionState, useState } from "react";
import { formatPeso } from "@/lib/schedule";
import { createOpenPlayPayment, type OpenPlayFormState } from "../actions";

export function OpenPlayForm({ code, fee, maxPlayers }: { code: string; fee: number; maxPlayers: number }) {
  const [state, action, pending] = useActionState<OpenPlayFormState, FormData>(createOpenPlayPayment, {});
  const [count, setCount] = useState(Math.max(1, Math.min(state.values?.names.length ?? 1, maxPlayers)));
  const [names, setNames] = useState<string[]>(state.values?.names ?? []);
  const setName = (i: number, v: string) => setNames((n) => Object.assign([...n], { [i]: v }));
  const step = "flex h-10 w-10 items-center justify-center rounded-full border border-kitchen text-lg text-steel disabled:opacity-40";

  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="code" value={code} />
      <div>
        <p className="label" id="count-label">How many players?</p>
        <div className="flex items-center gap-4" role="group" aria-labelledby="count-label">
          <button type="button" className={step} aria-label="Fewer players" disabled={count <= 1} onClick={() => setCount((c) => c - 1)}>–</button>
          <span className="w-8 text-center font-display text-2xl font-semibold text-steel" aria-live="polite">{count}</span>
          <button type="button" className={step} aria-label="More players" disabled={count >= maxPlayers} onClick={() => setCount((c) => c + 1)}>+</button>
          <span className="text-xs text-steel/60">Up to {maxPlayers} in one payment</span>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Player names, as shown in Reclub</legend>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-right text-sm text-steel/60">{i + 1}</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={60}
              autoComplete={i === 0 ? "name" : "off"}
              aria-label={`Player ${i + 1} name`}
              value={names[i] ?? ""}
              onChange={(e) => setName(i, e.target.value)}
              className="input"
              placeholder={i === 0 ? "Juan Dela Cruz" : ""}
            />
          </div>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="mobile">Your mobile</label>
          <input id="mobile" name="mobile" type="tel" required autoComplete="tel" defaultValue={state.values?.mobile} className="input" placeholder="0917 123 4567" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email (optional)</label>
          <input id="email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} className="input" placeholder="you@example.com" />
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-kitchen-light pt-3">
        <span className="text-sm text-steel/70">{count} × {formatPeso(fee)}</span>
        <span className="font-display text-2xl font-semibold text-court">{formatPeso(count * fee)}</span>
      </div>
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>{pending ? "Holding your spots…" : "Continue to payment"}</button>
      <p className="text-xs text-steel/60">Your spots are held for a short time while you pay. Our staff accept you from the Reclub waiting list once your payment is confirmed.</p>
    </form>
  );
}
