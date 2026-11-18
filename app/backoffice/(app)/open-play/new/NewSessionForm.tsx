"use client";

import { useState, useTransition } from "react";
import { formatHour, formatPeso } from "@/lib/schedule";
import type { ActionResult } from "../../../actions";
import { createSession } from "../../../open-play-actions";

export function NewSessionForm({
  hours,
  courts,
  fee,
  playersPerCourt,
  today,
  initial = {},
}: {
  hours: number[];
  courts: { id: number; name: string }[];
  fee: number;
  playersPerCourt: number;
  today: string;
  /** pre-filled from the schedule's "Create open play session" link */
  initial?: { date?: string; from?: number; to?: number; court?: number };
}) {
  const [date, setDate] = useState(initial.date ?? today);
  const [from, setFrom] = useState(initial.from && hours.includes(initial.from) ? initial.from : 18);
  const [to, setTo] = useState(initial.to && initial.to > (initial.from ?? 0) ? initial.to : 22);
  const [picked, setPicked] = useState<number[]>(
    initial.court && courts.some((c) => c.id === initial.court) ? [initial.court] : courts.map((c) => c.id),
  );
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const ends = [...hours.slice(1), hours[hours.length - 1] + 1];
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].sort()));

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await createSession({ date, fromHour: from, toHour: to, courtIds: picked, note })));
      }}
    >
      <div>
        <label className="label" htmlFor="date">Date</label>
        <input id="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="from">From</label>
          <select id="from" className="input" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {hours.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <select id="to" className="input" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {ends.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Courts</legend>
        <div className="flex flex-wrap gap-2">
          {courts.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-kitchen px-4 py-1.5 text-sm font-semibold text-steel has-[:checked]:border-court has-[:checked]:bg-court has-[:checked]:text-white">
              <input type="checkbox" className="sr-only" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="note">Note for staff (optional)</label>
        <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Beginners welcome" maxLength={200} />
      </div>
      <p className="rounded-lg bg-paper px-3 py-2 text-sm text-steel">
        {formatPeso(fee)} per player · limit {playersPerCourt * picked.length} players ({playersPerCourt} per court)
      </p>
      {result.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{result.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>{pending ? "Creating…" : "Create session"}</button>
    </form>
  );
}
