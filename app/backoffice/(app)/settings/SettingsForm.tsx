"use client";

import { useActionState } from "react";
import { formatHour } from "@/lib/schedule";
import { updateSettings, type FormResult } from "../../admin-actions";

type S = Record<string, string | number | null>;

function HourSelect({ name, value, from, to, label }: { name: string; value: number; from: number; to: number; label: string }) {
  const opts = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value} className="input">
        {opts.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
      </select>
    </div>
  );
}

export function SettingsForm({ s, gcashQr, mayaQr }: { s: S; gcashQr: string | null; mayaQr: string | null }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(updateSettings, {});
  const num = (k: string) => Number(s[k]);
  return (
    <form action={action} className="space-y-5">
      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-bold text-steel uppercase sm:col-span-2">Rates and booking rules</h2>
        <div>
          <label className="label" htmlFor="rate">Rate per hour (₱)</label>
          <input id="rate" name="rate_per_hour" type="number" min={1} defaultValue={num("rate_per_hour")} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="hold">Payment hold (minutes)</label>
          <input id="hold" name="hold_minutes" type="number" min={5} max={1440} defaultValue={num("hold_minutes")} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="weeks">Booking window (weeks ahead)</label>
          <input id="weeks" name="max_weeks_ahead" type="number" min={1} max={52} defaultValue={num("max_weeks_ahead")} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="lead">Early bird / late night notice (hours)</label>
          <input id="lead" name="offhours_lead_hours" type="number" min={0} max={168} defaultValue={num("offhours_lead_hours")} className="input" />
        </div>
        <p className="text-xs text-steel/60 sm:col-span-2">Rate changes apply to new bookings only.</p>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-bold text-steel uppercase sm:col-span-2">Open play</h2>
        <div>
          <label className="label" htmlFor="op_fee">Fee per player (₱)</label>
          <input id="op_fee" name="open_play_fee" type="number" min={1} max={10000} defaultValue={num("open_play_fee")} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="op_ppc">Players per court</label>
          <input id="op_ppc" name="open_play_players_per_court" type="number" min={1} max={50} defaultValue={num("open_play_players_per_court")} className="input" />
        </div>
        <p className="text-xs text-steel/60 sm:col-span-2">Changes apply to sessions created after you save.</p>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-4">
        <h2 className="text-sm font-bold text-steel uppercase sm:col-span-4">Court hours</h2>
        <HourSelect name="early_start" label="Early bird opens" value={num("early_start")} from={0} to={12} />
        <HourSelect name="regular_start" label="Regular starts" value={num("regular_start")} from={1} to={18} />
        <HourSelect name="late_start" label="Late night starts" value={num("late_start")} from={12} to={24} />
        <HourSelect name="close_hour" label="Closes (after midnight)" value={num("close_hour")} from={0} to={5} />
      </section>

      <section className="card grid gap-5 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-bold text-steel uppercase sm:col-span-2">Payment QR codes</h2>
        {[
          { k: "gcash", label: "GCash", qr: gcashQr },
          { k: "maya", label: "Maya", qr: mayaQr },
        ].map(({ k, label, qr }) => (
          <div key={k} className="space-y-2">
            <p className="font-semibold text-steel">{label}</p>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`${label} QR`} className="h-40 w-40 rounded border border-kitchen-light object-contain" />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded bg-paper text-xs text-steel/60">No QR uploaded</div>
            )}
            <input name={`${k}_qr`} type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-court file:px-3 file:py-1.5 file:text-white" aria-label={`Upload ${label} QR`} />
            <input name={`${k}_name`} defaultValue={(s[`${k}_name`] as string) ?? ""} placeholder="Account name" className="input" aria-label={`${label} account name`} />
            <input name={`${k}_number`} defaultValue={(s[`${k}_number`] as string) ?? ""} placeholder="Account number" className="input" aria-label={`${label} account number`} />
          </div>
        ))}
      </section>

      {(state.error || state.ok) && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${state.error ? "bg-red-50 text-red-700" : "bg-ball/30 text-ball-dark"}`}>{state.error ?? state.ok}</p>
      )}
      <button className="btn-primary px-6" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
