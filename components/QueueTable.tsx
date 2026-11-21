import type { QueueRound } from "@/lib/agent/queue";
import { formatHour, toManila } from "@/lib/schedule";

/** "6:15" (Manila time; the session header gives AM/PM context). */
export function roundTime(iso: string) {
  const m = toManila(new Date(iso));
  const h = formatHour(m.hour).replace(/(AM|PM)$/, "");
  return `${h}:${String(m.minute).padStart(2, "0")}`;
}

const team = (t: [string, string]) => `${t[0]}, ${t[1]}`;

/** Rounds × courts, with who sits out. Played rounds are dimmed; the current round is highlighted. */
export function QueueTable({
  courts,
  rounds,
  playedThrough,
  compact = false,
  markNow = true,
  action,
}: {
  courts: string[];
  rounds: QueueRound[];
  playedThrough: number;
  compact?: boolean;
  /** highlight the current round (off for an unsaved plan) */
  markNow?: boolean;
  /** extra cell for the current round (for example a "Mark played" button) */
  action?: React.ReactNode;
}) {
  const text = compact ? "text-xs" : "text-sm";
  // only courts that have games (6 players fill one court, not two)
  const used = courts.filter((c) => rounds.some((r) => r.games.some((g) => g.court === c)));
  const cols = used.length ? used : courts;
  return (
    <table className={`w-full border-collapse ${text}`}>
      <thead>
        <tr className="text-left text-steel/70">
          <th className="px-2 py-1 font-semibold">Time</th>
          {cols.map((c) => (
            <th key={c} className="px-2 py-1 font-semibold">
              {c}
            </th>
          ))}
          <th className="px-2 py-1 font-semibold">Sitting out</th>
          {action !== undefined && <th className="px-2 py-1" />}
        </tr>
      </thead>
      <tbody>
        {rounds.map((r, i) => {
          const played = i < playedThrough;
          const now = markNow && i === playedThrough;
          return (
            <tr
              key={r.start + i}
              className={`border-t border-kitchen-light align-top ${played ? "text-steel/45" : ""} ${now ? "bg-ball/25 font-semibold" : ""}`}
              aria-current={now ? "step" : undefined}
            >
              <td className="px-2 py-1 whitespace-nowrap">
                {roundTime(r.start)}
                {played && <span className="sr-only"> (played)</span>}
                {now && <span className="ml-1 text-[10px] uppercase">now</span>}
              </td>
              {cols.map((c) => {
                const g = r.games.find((x) => x.court === c);
                return (
                  <td key={c} className="px-2 py-1">
                    {g ? `${team(g.a)} vs ${team(g.b)}` : "—"}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-steel/70">{r.out.join(", ") || "—"}</td>
              {action !== undefined && <td className="px-2 py-1 text-right">{now ? action : null}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
