"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { GridLegend, WeekGrid, type GridCell } from "@/components/WeekGrid";
import type { WeekData } from "@/lib/availability";
import { SLOT_ISSUE_TEXT, formatPeso, groupSlots, type BookingRules } from "@/lib/schedule";
import { createBooking, type BookState } from "./actions";

export function BookingPanel({
  court,
  week,
  rules,
  today,
}: {
  court: { id: number; name: string };
  week: WeekData;
  rules: BookingRules;
  today: string;
}) {
  // key -> iso; kept across week navigation so players can book on several days
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [state, action, pending] = useActionState<BookState, FormData>(createBooking, {});
  const router = useRouter();
  // a slot may have been taken meanwhile: reload availability after any error
  useEffect(() => {
    if (state.error) router.refresh();
  }, [state, router]);

  const cells = useMemo(() => {
    const out: Record<string, GridCell> = {};
    for (const [k, c] of Object.entries(week.cells)) {
      out[k] = {
        iso: c.iso,
        state: c.state,
        title:
          c.state === "available"
            ? "Available"
            : c.state === "unavailable"
              ? c.issue && SLOT_ISSUE_TEXT[c.issue]
              : c.state === "pending"
                ? "On hold for another player"
                : c.state === "open_play"
                  ? "Open play session. Register through Reclub."
                  : c.state === "blocked"
                    ? "Not available"
                    : "Booked",
      };
    }
    return out;
  }, [week.cells]);

  const toggle = (key: string, cell: GridCell) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < 12) next.set(key, cell.iso);
      return next;
    });

  const isos = [...selected.values()];
  const summary = groupSlots(isos.map((s) => new Date(s)), rules);
  const total = isos.length * rules.ratePerHour;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <WeekGrid
          days={week.days}
          hours={week.hours}
          cells={cells}
          rules={rules}
          selected={new Set(selected.keys())}
          onCellClick={toggle}
          isClickable={(c) => c.state === "available"}
          today={today}
        />
        <div className="mt-3">
          <GridLegend />
          <p className="mt-2 text-xs text-steel/60">
            Early bird and late night hours need at least {rules.offhoursLeadHours} hours&apos; notice. 12AM is the hour
            after 11PM of the same column.
          </p>
        </div>
      </div>

      <form id="booking-form" action={action} className="card h-fit scroll-mt-24 space-y-3 p-5 lg:sticky lg:top-24">
        <h2 className="font-display text-xl font-semibold text-steel uppercase">Your booking</h2>
        <p className="text-sm font-semibold text-court">{court.name}</p>
        {summary.length ? (
          <ul className="space-y-1 text-sm text-steel">
            {summary.map((s) => (
              <li key={s} className="rounded-md bg-ball/30 px-2 py-1">{s}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md bg-paper px-3 py-3 text-sm text-steel/60">Tap available hours on the schedule.</p>
        )}
        <div className="flex items-baseline justify-between border-t border-kitchen-light pt-3">
          <span className="text-sm text-steel/70">
            {isos.length} hour{isos.length === 1 ? "" : "s"} × {formatPeso(rules.ratePerHour)}
          </span>
          <span className="font-display text-2xl font-semibold text-court">{formatPeso(total)}</span>
        </div>
        {selected.size > 0 && (
          <button type="button" className="text-xs text-steel/60 underline" onClick={() => setSelected(new Map())}>
            Clear selection
          </button>
        )}

        <input type="hidden" name="courtId" value={court.id} />
        <input type="hidden" name="slots" value={JSON.stringify(isos)} />
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" name="name" className="input" required autoComplete="name" defaultValue={state.values?.name} placeholder="Juan dela Cruz" />
        </div>
        <div>
          <label className="label" htmlFor="mobile">Mobile number</label>
          <input id="mobile" name="mobile" className="input" required inputMode="tel" autoComplete="tel" defaultValue={state.values?.mobile} placeholder="0917 123 4567" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="email" defaultValue={state.values?.email} placeholder="juan@email.com" />
        </div>
        {state.error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button type="submit" className="btn-primary w-full py-3 text-base" disabled={pending || isos.length === 0}>
          {pending ? "Reserving…" : isos.length ? `Reserve and pay ${formatPeso(total)}` : "Select hours to continue"}
        </button>
        <p className="text-xs text-steel/60">
          We hold your slot for {rules.holdMinutes} minutes while you pay with GCash or Maya.
        </p>
      </form>

      {isos.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t-4 border-surround bg-white px-4 py-3 lg:hidden">
          <span className="text-sm text-steel">
            {isos.length} hour{isos.length === 1 ? "" : "s"} · <strong className="text-court">{formatPeso(total)}</strong>
          </span>
          <a href="#booking-form" className="btn-primary">Continue</a>
        </div>
      )}
    </div>
  );
}
