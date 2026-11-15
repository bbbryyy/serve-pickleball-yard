"use client";

import { bandOf, dayShort, formatHour, type HoursConfig } from "@/lib/schedule";
import type { ReactNode } from "react";

export type GridCell = {
  iso: string;
  state: "available" | "pending" | "booked" | "blocked" | "open_play" | "unavailable";
  title?: string;
  label?: string;
};

const STATE_CLASS: Record<GridCell["state"], string> = {
  available: "bg-court hover:bg-court-dark cursor-pointer",
  pending: "bg-surround text-white",
  booked: "bg-kitchen text-steel",
  blocked: "bg-[repeating-linear-gradient(45deg,#2b2f36_0_5px,#4a505a_5px_10px)] text-white",
  // a lime ball on navy: hours set aside for open play sessions
  open_play: "bg-[radial-gradient(circle,#c8e63c_0_3px,transparent_4px),linear-gradient(#0f2f63,#0f2f63)] text-ball",
  unavailable: "bg-kitchen-light",
};

export function GridLegend({ staff = false }: { staff?: boolean }) {
  const items: [string, string][] = [
    ["bg-court", "Available"],
    ["bg-ball", "Selected"],
    ["bg-surround", staff ? "Pending / for verification" : "On hold"],
    ["bg-kitchen", "Booked"],
    ["bg-[radial-gradient(circle,#c8e63c_0_3px,transparent_4px),linear-gradient(#0f2f63,#0f2f63)]", "Open play"],
    ["bg-steel", "Blocked"],
    ["bg-kitchen-light border border-kitchen", "Not bookable"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel/80">
      {items.map(([cls, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded-sm ${cls}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function WeekGrid({
  days,
  hours,
  cells,
  rules,
  selected,
  onCellClick,
  isClickable,
  showLabels = false,
  today,
}: {
  days: string[];
  hours: number[];
  cells: Record<string, GridCell>;
  rules: HoursConfig;
  selected: Set<string>;
  onCellClick: (key: string, cell: GridCell) => void;
  isClickable: (cell: GridCell) => boolean;
  showLabels?: boolean;
  today?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-kitchen-light bg-white">
      <table className="w-full min-w-[340px] table-fixed border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-12 bg-white sm:w-16" />
            {days.map((d) => (
              <th
                key={d}
                className={`px-0.5 py-2 text-center font-semibold ${d === today ? "text-surround-dark" : "text-steel"}`}
              >
                <span className="block text-[11px] uppercase">{dayShort(d)}</span>
                <span className="block font-display text-base leading-none">{Number(d.slice(8))}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((h, i) => {
            const band = bandOf(h, rules);
            const bandHeader: ReactNode =
              i === 0 || band !== bandOf(hours[i - 1], rules) ? (
                <tr key={`band-${h}`}>
                  <td
                    colSpan={days.length + 1}
                    className={`px-2 pt-2 pb-1 text-[10px] font-bold tracking-wider uppercase ${
                      band === "regular" ? "text-court" : band === "early" ? "text-surround-dark" : "text-steel"
                    }`}
                  >
                    {band === "early" ? "Early bird" : band === "regular" ? "Regular hours" : "Late night"}
                  </td>
                </tr>
              ) : null;
            return [
              bandHeader,
              <tr key={h}>
                <td className="sticky left-0 z-10 bg-white pr-1.5 text-right whitespace-nowrap text-steel/70 sm:pr-2">
                  {formatHour(h)}
                </td>
                {days.map((d) => {
                  const key = `${d}|${h}`;
                  const cell = cells[key];
                  if (!cell) return <td key={key} />;
                  const isSel = selected.has(key);
                  const clickable = isClickable(cell);
                  return (
                    <td key={key} className="p-[2px]">
                      <button
                        type="button"
                        title={cell.title}
                        disabled={!clickable}
                        onClick={() => onCellClick(key, cell)}
                        aria-pressed={isSel}
                        aria-label={`${dayShort(d)} ${d} ${formatHour(h)}: ${isSel ? "selected" : cell.state.replace("_", " ")}`}
                        className={`block h-7 w-full truncate rounded-[3px] px-1 text-left leading-7 transition ${
                          isSel ? "bg-ball text-ball-dark ring-2 ring-ball-dark/30" : STATE_CLASS[cell.state]
                        } ${clickable ? "cursor-pointer" : "cursor-default"} ${
                          band !== "regular" && cell.state === "available" && !isSel ? "opacity-80" : ""
                        }`}
                      >
                        {showLabels ? cell.label : null}
                      </button>
                    </td>
                  );
                })}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
