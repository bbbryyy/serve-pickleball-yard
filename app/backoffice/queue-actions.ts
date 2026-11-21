"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { adjustPlayers, buildQueue, loadQueueSession } from "@/lib/openPlayQueue";
import { getSiteSettings } from "@/lib/settings";
import { createUserClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

// Open play queue (staff + admin). Dink only plans; saving happens here, through RPCs that re-check
// the role and the session.

const name = z.string().trim().min(1).max(40);
const team = z.tuple([name, name]);
const Round = z.object({
  start: z.string().datetime(),
  games: z.array(z.object({ court: z.string().max(40), a: team, b: team })).max(10),
  out: z.array(name).max(200),
});
const Draft = z.object({
  sessionId: z.string().uuid(),
  minutesPerGame: z.number().int().min(5).max(60),
  players: z.array(name).min(4).max(200),
  rounds: z.array(Round).min(1).max(200),
  playedThrough: z.number().int().min(0),
});

function queueError(message: string): string {
  if (message.includes("session_cancelled")) return "This session was cancelled.";
  if (message.includes("session_closed")) return "This session has ended.";
  if (message.includes("forbidden")) return "Only staff can change the queue.";
  if (message.includes("not_found")) return "Couldn't find that queue.";
  return "Couldn't save the queue. Try again.";
}

const refresh = (sessionId: string) => revalidatePath(`/backoffice/open-play/${sessionId}`);

/** Save a queue Dink planned (replaces the session's saved queue). */
export async function saveQueue(input: unknown): Promise<ActionResult> {
  await requireStaff();
  const parsed = Draft.safeParse(input);
  if (!parsed.success) return { error: "That queue doesn't look right. Ask Dink to plan it again." };
  const d = parsed.data;
  const { error } = await (await createUserClient()).rpc("save_open_play_queue", {
    p_session_id: d.sessionId,
    p_minutes: d.minutesPerGame,
    p_players: d.players,
    p_rounds: d.rounds,
    p_played_through: Math.min(d.playedThrough, d.rounds.length),
  });
  if (error) return { error: queueError(error.message) };
  refresh(d.sessionId);
  return { ok: "Queue saved" };
}

/** Move "now" to the next round (or back one, to undo). */
export async function markQueueRound(sessionId: string, playedThrough: number): Promise<ActionResult> {
  await requireStaff();
  const { error } = await (await createUserClient()).rpc("mark_open_play_queue_round", {
    p_session_id: sessionId,
    p_played_through: playedThrough,
  });
  if (error) return { error: queueError(error.message) };
  refresh(sessionId);
  return { ok: "Updated" };
}

/** Rebuild the rounds not yet played after players leave or arrive. Played rounds stay. */
export async function redoQueue(sessionId: string, left: string[], arrived: string[], minutes?: number): Promise<ActionResult> {
  await requireStaff();
  const names = z.array(name).max(30);
  const l = names.safeParse(left);
  const a = names.safeParse(arrived);
  if (!l.success || !a.success) return { error: "Check the names and try again." };
  const supabase = await createUserClient();
  const { rules } = await getSiteSettings();
  const session = await loadQueueSession(supabase, sessionId, rules);
  if (!session?.saved) return { error: "Save a queue for this session first." };
  const players = adjustPlayers(session.saved.players, l.data, a.data);
  if (players.length < 4) return { error: "A doubles queue needs at least 4 players." };
  const draft = buildQueue(session, players, minutes ?? session.saved.minutes_per_game, new Date());
  if (draft.rounds.length === draft.playedThrough) return { error: "No rounds left to plan before the session ends." };
  const { error } = await supabase.rpc("save_open_play_queue", {
    p_session_id: sessionId,
    p_minutes: draft.minutesPerGame,
    p_players: draft.players,
    p_rounds: draft.rounds,
    p_played_through: draft.playedThrough,
  });
  if (error) return { error: queueError(error.message) };
  refresh(sessionId);
  return { ok: "Rest of the queue rebuilt" };
}
