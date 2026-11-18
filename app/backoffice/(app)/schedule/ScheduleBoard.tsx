"use client";

import { useMemo, useState, useTransition } from "react";
import { GridLegend, WeekGrid, type GridCell } from "@/components/WeekGrid";
import type { WeekData } from "@/lib/availability";
import { formatPeso, groupSlots, type BookingRules } from "@/lib/schedule";
import { blockSlots, createWalkIn, unblockSlots, type ActionResult } from "../../actions";

export type SlotDetail =
  | { kind: "booking"; ref: string; name: string; mobile: string | null; status: string; source: string; total: number }
  | { kind: "block" | "open_play"; reason: string }
  | { kind: "session"; reason: string; sessionId: string };

const STATUS: Record<string, string> = { pending_payment: "Waiting for payment", for_verification: "For verification", confirmed: "Confirmed" };

export function ScheduleBoard({
  court,
  week,
  rules,
  details,
  today,
}: {
  court: { id: number; name: string };
  week: WeekData;
  rules: BookingRules;
  details: Record<string, SlotDetail>;
  today: string;
}) {
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [mode, setMode] = useState<"available" | "blocked" | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", mobile: "", paymentMethod: "cash" as "cash" | "gcash" | "maya", note: "", reason: "", openPlayNote: "" });

  const cells = useMemo(() => {
    const out: Record<string, GridCell> = {};
    for (const [k, c] of Object.entries(week.cells)) {
      const d = details[k];
      out[k] = {
        iso: c.iso,
        state: c.state,
        label: d?.kind === "booking" ? d.name.split(" ")[0] : d ? d.reason : undefined,
        title:
          d?.kind === "booking"
            ? `${d.ref} · ${d.name} · ${STATUS[d.status] ?? d.status}`
            : d?.kind === "session"
              ? "Open play session · tap to open"
              : d?.kind === "open_play"
                ? `Open play: ${d.reason}`
              : d
                ? `Blocked: ${d.reason}`
                : undefined,
      };
    }
    return out;
  }, [week.cells, details]);

  const onCellClick = (key: string, cell: GridCell) => {
    setResult({});
    if (cell.state === "booked" || cell.state === "pending" || details[key]?.kind === "session") {
      setFocus(key);
      return;
    }
    // blocked and open play hours are freed up the same way
    const kind = cell.state === "blocked" || cell.state === "open_play" ? "blocked" : "available";
    setFocus(null);
    setSelected((prev) => {
      const next = new Map(mode === kind ? prev : []);
      if (next.has(key)) next.delete(key);
      else next.set(key, cell.iso);
      setMode(next.size ? kind : null);
      return next;
    });
  };

  const isos = [...selected.values()];
  const clear = () => {
    setSelected(new Map());
    setMode(null);
  };
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) clear();
    });

  const focused = focus ? details[focus] : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <WeekGrid
          days={week.days}
          hours={week.hours}
          cells={cells}
          rules={rules}
          selected={new Set(selected.keys())}
          onCellClick={onCellClick}
          isClickable={(c) => c.state !== "unavailable"}
          showLabels
          today={today}
        />
        <div className="mt-3"><GridLegend staff /></div>
      </div>

      <div className="card h-fit space-y-3 p-5 xl:sticky xl:top-8">
        {focused?.kind === "booking" ? (
          <>
            <h2 className="font-display text-xl font-semibold text-steel uppercase">Booking</h2>
            <p className="font-mono text-sm font-semibold">{focused.ref}</p>
            <p className="font-semibold text-steel">{focused.name}</p>
            <p className="text-sm">
              {focused.mobile ? (
                <a className="text-court hover:underline" href={`tel:${focused.mobile}`}>{focused.mobile}</a>
              ) : (
                <span className="text-steel/60">No mobile</span>
              )}
            </p>
            <p className="text-sm text-steel/70">{STATUS[focused.status] ?? focused.status} · {focused.source === "walk_in" ? "Walk-in" : "Online"} · {formatPeso(focused.total)}</p>
            <a className="btn-ghost w-full" href={`/backoffice?status=${focused.status}&q=${focused.ref}`}>Open in bookings</a>
            <button className="text-xs text-steel/60 underline" onClick={() => setFocus(null)}>Close</button>
          </>
        ) : focused?.kind === "session" ? (
          <>
            <h2 className="font-display text-xl font-semibold text-steel uppercase">Open play session</h2>
            <p className="text-sm text-steel/70">These hours belong to an open play session. See who has paid, add walk-ins, or cancel it from the session page.</p>
            <a className="btn-ghost w-full" href={`/backoffice/open-play/${focused.sessionId}`}>Open session</a>
            <button className="text-xs text-steel/60 underline" onClick={() => setFocus(null)}>Close</button>
          </>
        ) : mode === "blocked" ? (
          <>
            <h2 className="font-display text-xl font-semibold text-steel uppercase">Free up hours</h2>
            <ul className="text-sm text-steel">{groupSlots(isos.map((s) => new Date(s)), rules).map((s) => <li key={s}>{s}</li>)}</ul>
            <button className="btn-court w-full" disabled={pending} onClick={() => run(() => unblockSlots(court.id, isos))}>Make {isos.length} hour(s) bookable</button>
            <button className="text-xs text-steel/60 underline" onClick={clear}>Clear selection</button>
          </>
        ) : mode === "available" ? (
          <>
            <h2 className="font-display text-xl font-semibold text-steel uppercase">{court.name}</h2>
            <ul className="space-y-1 text-sm text-steel">
              {groupSlots(isos.map((s) => new Date(s)), rules).map((s) => <li key={s} className="rounded bg-ball/30 px-2 py-1">{s}</li>)}
            </ul>
            <p className="text-sm text-steel/70">{isos.length} hour(s) · {formatPeso(isos.length * rules.ratePerHour)}</p>

            <div className="space-y-2 border-t border-kitchen-light pt-3">
              <p className="label">Walk-in or phone reservation</p>
              <input className="input" placeholder="Player name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className="input" placeholder={form.paymentMethod === "cash" ? "Mobile (optional for cash)" : "Mobile (09XXXXXXXXX)"} inputMode="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
              <select className="input" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as typeof form.paymentMethod })}>
                <option value="cash">Paid cash</option>
                <option value="gcash">Paid GCash</option>
                <option value="maya">Paid Maya</option>
              </select>
              <input className="input" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <button
                className="btn-primary w-full"
                disabled={pending || form.name.trim().length < 2}
                onClick={() => run(() => createWalkIn({ courtId: court.id, slots: isos, ...form }))}
              >
                Reserve as confirmed
              </button>
            </div>
            <div className="space-y-2 border-t border-kitchen-light pt-3">
              <p className="label">Or set as open play</p>
              <input className="input" placeholder="Note (e.g. ₱150 per player, register on Reclub)" value={form.openPlayNote} onChange={(e) => setForm({ ...form, openPlayNote: e.target.value })} />
              <button
                className="btn w-full bg-court-deep text-ball hover:bg-court-dark"
                disabled={pending}
                onClick={() => run(() => blockSlots(court.id, isos, form.openPlayNote || "Open play", "open_play"))}
              >
                Set {isos.length} hour(s) as open play
              </button>
            </div>
            <div className="space-y-2 border-t border-kitchen-light pt-3">
              <p className="label">Or block these hours</p>
              <input className="input" placeholder="Reason (e.g. maintenance, private event)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <button className="btn bg-steel w-full text-white hover:bg-steel/90" disabled={pending} onClick={() => run(() => blockSlots(court.id, isos, form.reason))}>
                Block {isos.length} hour(s)
              </button>
            </div>
            <button className="text-xs text-steel/60 underline" onClick={clear}>Clear selection</button>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl font-semibold text-steel uppercase">{court.name}</h2>
            <p className="text-sm text-steel/70">
              Tap free hours to reserve them for a walk-in or phone booking, set them as open play, or block them. Tap a booking to see who it&apos;s for. Tap open play or blocked hours to make them bookable again.
            </p>
          </>
        )}
        {(result.error || result.ok) && (
          <p role="status" className={`rounded-md px-3 py-2 text-sm ${result.error ? "bg-red-50 text-red-700" : "bg-ball/30 text-ball-dark"}`}>{result.error ?? result.ok}</p>
        )}
      </div>
    </div>
  );
}
