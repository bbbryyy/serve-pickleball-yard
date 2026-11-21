"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "../../../actions";
import { markQueueRound, redoQueue } from "../../../queue-actions";

function Result({ r }: { r: ActionResult | null }) {
  if (!r || (!r.error && !r.ok)) return null;
  return <p role="status" className={`text-sm ${r.error ? "text-red-700" : "text-court"}`}>{r.error ?? r.ok}</p>;
}

/** "Mark played" for the current round, with Undo for a mistaken tap. */
export function MarkRound({ sessionId, playedThrough, total }: { sessionId: string; playedThrough: number; total: number }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<ActionResult | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {playedThrough > 0 && (
          <button type="button" disabled={pending} onClick={() => start(async () => setR(await markQueueRound(sessionId, playedThrough - 1)))} className="btn-ghost px-2.5 py-1 text-xs">
            Undo
          </button>
        )}
        {playedThrough < total && (
          <button type="button" disabled={pending} onClick={() => start(async () => setR(await markQueueRound(sessionId, playedThrough + 1)))} className="btn-primary px-2.5 py-1 text-xs">
            Mark played
          </button>
        )}
      </div>
      {r?.error && <Result r={r} />}
    </div>
  );
}

/** Rebuild the rounds not yet played after players leave or arrive. */
export function RedoRest({ sessionId, players, fromLabel }: { sessionId: string; players: string[]; fromLabel: string }) {
  const [pending, start] = useTransition();
  const [left, setLeft] = useState<string[]>([]);
  const [arrived, setArrived] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [r, setR] = useState<ActionResult | null>(null);

  const add = () => {
    const n = name.trim().replace(/\s+/g, " ");
    if (n && !arrived.includes(n) && !players.includes(n)) setArrived([...arrived, n]);
    setName("");
  };
  const toggle = (p: string) => setLeft(left.includes(p) ? left.filter((x) => x !== p) : [...left, p]);

  return (
    <details className="rounded-xl border border-dashed border-kitchen p-3">
      <summary className="cursor-pointer text-sm font-semibold text-steel">Redo the rest (from {fromLabel})</summary>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-steel/70">Tap players who left</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {players.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={left.includes(p)}
                onClick={() => toggle(p)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${left.includes(p) ? "border-red-300 bg-red-50 text-red-800 line-through" : "border-kitchen text-steel hover:border-court"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="arrived" className="text-xs font-semibold text-steel/70">Add players who arrived</label>
          <div className="mt-1 flex gap-2">
            <input
              id="arrived"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Leo"
              className="input max-w-48"
            />
            <button type="button" onClick={add} className="btn-ghost px-3 py-1.5 text-sm">
              Add
            </button>
          </div>
          {arrived.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {arrived.map((a) => (
                <button key={a} type="button" onClick={() => setArrived(arrived.filter((x) => x !== a))} className="rounded-full bg-ball/40 px-2.5 py-0.5 text-xs text-ball-dark" aria-label={`Remove ${a}`}>
                  {a} ×
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending || (left.length === 0 && arrived.length === 0)}
            onClick={() =>
              start(async () => {
                const res = await redoQueue(sessionId, left, arrived);
                setR(res);
                if (res.ok) {
                  setLeft([]);
                  setArrived([]);
                }
              })
            }
            className="btn-primary px-4 py-1.5 text-sm"
          >
            {pending ? "Rebuilding…" : "Rebuild remaining rounds"}
          </button>
          <p className="text-xs text-steel/60">Played rounds stay. Game counts carry over so everyone evens out.</p>
        </div>
        <Result r={r} />
      </div>
    </details>
  );
}
