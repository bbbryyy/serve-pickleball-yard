"use client";

import { useActionState, useState } from "react";
import { submitPayment, type PayState } from "./actions";

export function PaymentForm({
  reference,
  submit = submitPayment,
}: {
  reference: string;
  /** server action that stores the proof; court bookings by default */
  submit?: (prev: PayState, form: FormData) => Promise<PayState>;
}) {
  const [state, action, pending] = useActionState<PayState, FormData>(submit, {});
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <form action={action} className="card space-y-3 p-5">
      <h2 className="font-display text-xl font-semibold text-steel uppercase">Upload payment proof</h2>
      <input type="hidden" name="ref" value={reference} />
      <fieldset>
        <legend className="label">Paid with</legend>
        <div className="grid grid-cols-2 gap-2">
          {[["gcash", "GCash"], ["maya", "Maya"]].map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-kitchen px-3 py-2 text-sm has-[:checked]:border-court has-[:checked]:bg-court/10">
              <input type="radio" name="method" value={v} required defaultChecked={v === "gcash"} className="accent-court" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="refNo">Reference no. on receipt</label>
        <input id="refNo" name="refNo" className="input" required placeholder="1234 567 890123" />
      </div>
      <div>
        <label className="label" htmlFor="proof">Payment screenshot</label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="block w-full text-sm text-steel file:mr-3 file:rounded-md file:border-0 file:bg-court file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Screenshot preview" className="mt-2 max-h-48 rounded border border-kitchen-light" />
        )}
      </div>
      {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button type="submit" className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Uploading…" : "Submit payment"}
      </button>
    </form>
  );
}
