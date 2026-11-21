import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstNames, planQueue, roundStarts, type QueueDraft, type QueueRound } from "./agent/queue";
import { formatSessionTime } from "./openPlay";
import type { HoursConfig } from "./schedule";

export type SavedQueue = {
  session_id: string;
  minutes_per_game: number;
  players: string[];
  rounds: QueueRound[];
  played_through: number;
  version: number;
  updated_at: string;
};

export type QueueSession = {
  id: string;
  code: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  courts: string[];
  /** first names of players on confirmed payments, in payment order */
  paidPlayers: string[];
  saved: SavedQueue | null;
};

/** One session with its courts, paid players (first names) and saved queue, read as the signed-in staff user. */
export async function loadQueueSession(supabase: SupabaseClient, sessionId: string, rules: HoursConfig): Promise<QueueSession | null> {
  const [{ data: s }, { data: pays }, { data: saved }] = await Promise.all([
    supabase
      .from("open_play_sessions")
      .select("id, code, starts_at, ends_at, status, open_play_session_courts(court_id, courts(name))")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("open_play_payments")
      .select("created_at, open_play_players(position, name)")
      .eq("session_id", sessionId)
      .eq("status", "confirmed")
      .order("created_at"),
    supabase.from("open_play_queues").select("*").eq("session_id", sessionId).maybeSingle(),
  ]);
  if (!s) return null;
  const courts = ((s.open_play_session_courts ?? []) as unknown as { court_id: number; courts: { name: string } | null }[])
    .sort((a, b) => a.court_id - b.court_id)
    .map((c) => c.courts?.name ?? `Court ${c.court_id}`);
  const names = ((pays ?? []) as unknown as { open_play_players: { position: number; name: string }[] }[]).flatMap((p) =>
    [...(p.open_play_players ?? [])].sort((a, b) => a.position - b.position).map((x) => x.name),
  );
  const startsAt = new Date(s.starts_at);
  const endsAt = new Date(s.ends_at);
  return {
    id: s.id,
    code: s.code,
    title: formatSessionTime(startsAt, endsAt, rules),
    startsAt,
    endsAt,
    status: s.status,
    courts,
    paidPlayers: firstNames(names),
    saved: (saved as SavedQueue | null) ?? null,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Apply "absent" and "walk-in" changes to a player list (names matched without case). */
export function adjustPlayers(players: string[], absent: string[] = [], add: string[] = []): string[] {
  const gone = new Set(absent.map(norm));
  const kept = players.filter((p) => !gone.has(norm(p)) && !gone.has(norm(p.split(" ")[0])));
  const extra = add.map((a) => a.trim().replace(/\s+/g, " ")).filter((a) => a && !kept.some((k) => norm(k) === norm(a)));
  return [...kept, ...extra];
}

/**
 * Plan a queue for the session. Played rounds of a saved queue are kept; the rest is planned from
 * the next round. A fresh queue on a session already under way starts at the next round boundary.
 */
export function buildQueue(session: QueueSession, players: string[], minutes: number, now: Date): QueueDraft {
  const saved = session.saved;
  const played = saved && saved.played_through > 0 ? saved.rounds.slice(0, saved.played_through) : [];
  let starts: string[];
  if (played.length) {
    // carry on after the last played round, at the (possibly new) game length
    const lastEnd = new Date(new Date(played[played.length - 1].start).getTime() + saved!.minutes_per_game * 60_000);
    starts = roundStarts(lastEnd, session.endsAt, minutes);
  } else {
    starts = roundStarts(session.startsAt, session.endsAt, minutes).filter((t) => new Date(t).getTime() + minutes * 60_000 > now.getTime());
  }
  const rest = planQueue({ players, courts: session.courts, starts, seed: session.id, played });
  return {
    sessionId: session.id,
    title: session.title,
    courts: session.courts,
    minutesPerGame: minutes,
    players,
    rounds: [...played, ...rest],
    playedThrough: played.length,
    replaces: Boolean(saved),
  };
}
