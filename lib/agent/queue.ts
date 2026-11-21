// Open play queue planner (pure: no database, no network).
// Doubles on every court. Fair by design: the players with the fewest games play next,
// and teams are mixed so the same partners and opponents repeat as little as possible.

export type QueueGame = { court: string; a: [string, string]; b: [string, string] };
export type QueueRound = { start: string; games: QueueGame[]; out: string[] };

export type PlanQueueInput = {
  players: string[];
  /** court labels, e.g. ["Court 1", "Court 2"] */
  courts: string[];
  /** start time (ISO) of each round still to plan */
  starts: string[];
  /** same seed → same queue (use the session id) */
  seed: string;
  /** rounds already played: their games count toward fairness and repeat partners */
  played?: QueueRound[];
};

/** Small seeded random generator (mulberry32 over a string hash). */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

type History = { games: Map<string, number>; last: Map<string, number>; partners: Map<string, number>; opponents: Map<string, number> };

function record(h: History, round: QueueRound, index: number) {
  for (const g of round.games) {
    for (const p of [...g.a, ...g.b]) {
      h.games.set(p, (h.games.get(p) ?? 0) + 1);
      h.last.set(p, index);
    }
    h.partners.set(pairKey(g.a[0], g.a[1]), (h.partners.get(pairKey(g.a[0], g.a[1])) ?? 0) + 1);
    h.partners.set(pairKey(g.b[0], g.b[1]), (h.partners.get(pairKey(g.b[0], g.b[1])) ?? 0) + 1);
    for (const x of g.a) for (const y of g.b) h.opponents.set(pairKey(x, y), (h.opponents.get(pairKey(x, y)) ?? 0) + 1);
  }
}

/** The best way to split four players into two teams, and its repeat cost. */
function bestSplit(four: string[], h: History): { a: [string, string]; b: [string, string]; cost: number } {
  const [p, q, r, s] = four;
  const options: [[string, string], [string, string]][] = [
    [[p, q], [r, s]],
    [[p, r], [q, s]],
    [[p, s], [q, r]],
  ];
  let best = { a: options[0][0], b: options[0][1], cost: Infinity };
  for (const [a, b] of options) {
    let cost = 10 * ((h.partners.get(pairKey(a[0], a[1])) ?? 0) + (h.partners.get(pairKey(b[0], b[1])) ?? 0));
    for (const x of a) for (const y of b) cost += h.opponents.get(pairKey(x, y)) ?? 0;
    if (cost < best.cost) best = { a, b, cost };
  }
  return best;
}

/** Plan the rounds in `starts`, continuing fairly from any `played` rounds. */
export function planQueue(input: PlanQueueInput): QueueRound[] {
  const players = [...new Set(input.players.map((p) => p.trim()).filter(Boolean))];
  const rand = seededRandom(`${input.seed}:${input.played?.length ?? 0}:${players.join(",")}`);
  const h: History = { games: new Map(), last: new Map(), partners: new Map(), opponents: new Map() };
  (input.played ?? []).forEach((r, i) => record(h, r, i));
  const offset = input.played?.length ?? 0;
  // a fixed random order breaks ties fairly
  const tie = new Map(players.map((p) => [p, rand()]));

  const courtsPerRound = Math.min(input.courts.length, Math.floor(players.length / 4));
  const rounds: QueueRound[] = [];
  input.starts.forEach((start, k) => {
    const index = offset + k;
    if (courtsPerRound === 0) {
      rounds.push({ start, games: [], out: [...players] });
      return;
    }
    // fewest games first, then whoever has waited longest
    const order = [...players].sort(
      (x, y) =>
        (h.games.get(x) ?? 0) - (h.games.get(y) ?? 0) ||
        (h.last.get(x) ?? -1) - (h.last.get(y) ?? -1) ||
        tie.get(x)! - tie.get(y)!,
    );
    const playing = order.slice(0, courtsPerRound * 4);
    const out = order.slice(courtsPerRound * 4).sort((x, y) => players.indexOf(x) - players.indexOf(y));

    // shuffle, cut into courts, then swap players between courts while it lowers repeats
    for (let i = playing.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [playing[i], playing[j]] = [playing[j], playing[i]];
    }
    const groups = Array.from({ length: courtsPerRound }, (_, c) => playing.slice(c * 4, c * 4 + 4));
    const groupCost = (g: string[]) => bestSplit(g, h).cost;
    for (let pass = 0, improved = true; improved && pass < 20; pass++) {
      improved = false;
      for (let g1 = 0; g1 < groups.length; g1++)
        for (let g2 = g1 + 1; g2 < groups.length; g2++)
          for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++) {
              const before = groupCost(groups[g1]) + groupCost(groups[g2]);
              [groups[g1][i], groups[g2][j]] = [groups[g2][j], groups[g1][i]];
              if (groupCost(groups[g1]) + groupCost(groups[g2]) < before) improved = true;
              else [groups[g1][i], groups[g2][j]] = [groups[g2][j], groups[g1][i]];
            }
    }
    const round: QueueRound = {
      start,
      games: groups.map((g, c) => {
        const { a, b } = bestSplit(g, h);
        return { court: input.courts[c], a, b };
      }),
      out,
    };
    record(h, round, index);
    rounds.push(round);
  });
  return rounds;
}

/** Round start times from the session start, every `minutes`, while a full game still fits. */
export function roundStarts(startsAt: Date, endsAt: Date, minutes: number): string[] {
  const out: string[] = [];
  for (let t = startsAt.getTime(); t + minutes * 60_000 <= endsAt.getTime(); t += minutes * 60_000) out.push(new Date(t).toISOString());
  return out;
}

/** Games each player has in a queue (played and planned). */
export function gameCounts(rounds: QueueRound[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rounds) for (const g of r.games) for (const p of [...g.a, ...g.b]) counts[p] = (counts[p] ?? 0) + 1;
  return counts;
}

/** "Juan dela Cruz" → "Juan"; repeated first names get the last name's initial ("Juan D."). */
export function firstNames(fullNames: string[]): string[] {
  const parts = fullNames.map((n) => n.trim().replace(/\s+/g, " ").split(" ").filter(Boolean));
  const first = parts.map((p) => p[0] ?? "Guest");
  const seen = new Map<string, number>();
  first.forEach((f) => seen.set(f.toLowerCase(), (seen.get(f.toLowerCase()) ?? 0) + 1));
  return parts.map((p, i) => {
    const f = first[i];
    if ((seen.get(f.toLowerCase()) ?? 0) < 2 || p.length < 2) return f;
    return `${f} ${p[p.length - 1][0].toUpperCase()}.`;
  });
}

export const firstName = (fullName: string) => firstNames([fullName])[0];

/** A planned queue for one session, shown as a card and saved by staff. */
export type QueueDraft = {
  sessionId: string;
  /** "Sat Nov 21 · 6PM–10PM" */
  title: string;
  courts: string[];
  minutesPerGame: number;
  players: string[];
  rounds: QueueRound[];
  /** rounds already played (kept from the saved queue) */
  playedThrough: number;
  /** the session already has a saved queue that saving would replace */
  replaces: boolean;
};
