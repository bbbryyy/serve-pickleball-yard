"use client";

import { useEffect, useState } from "react";
import { rotateCourt } from "@/lib/openPlay";

// A top-down court where open play rotates: every few seconds the pair that
// just played steps off to the back of the line and the next two walk on.
const PLAYERS = ["JD", "AR", "MS", "LC", "BT", "CL", "PG", "RL"];
// [left %, top %] of the stage: 4 court spots, then 4 places in line
const COURT: [number, number][] = [[14, 15], [14, 43], [86, 15], [86, 43]];
const LINE: [number, number][] = [[26, 86], [42, 86], [58, 86], [74, 86]];

export function RotationCourt() {
  const [{ order, game }, setState] = useState(() => ({ order: PLAYERS.map((_, i) => i), game: 1 }));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      // winners stay: pick the losing side here, outside the state update
      const losers = Math.random() < 0.5 ? "left" : "right";
      setState((s) => ({ order: rotateCourt(s.order, losers), game: s.game + 1 }));
    }, 3200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="w-full max-w-[460px] rounded-3xl bg-court-deep p-5 text-white shadow-[0_20px_40px_-20px_rgb(15_47_99/0.6)]" aria-hidden>
      <div className="mb-3 flex justify-between text-sm text-white/70">
        <span>Court 1 · game in progress</span>
        <span className="font-display text-base text-ball">Game {game}</span>
      </div>
      <div className="relative aspect-[10/8]">
        {/* court: blue surface, white lines, kitchen lines either side of the net */}
        <div className="absolute inset-x-1 top-0 h-[58%] rounded-lg border-2 border-white bg-court">
          <div className="absolute inset-y-0 left-[30%] w-[20%] border-x-2 border-white/80" />
          <div className="absolute inset-y-0 right-[30%] w-[20%] border-r-2 border-white/80" />
          <div className="absolute -inset-y-1.5 left-1/2 w-0.5 -translate-x-1/2 bg-white" />
        </div>
        <span className="absolute top-[68%] left-1 text-sm text-white/70">Up next</span>
        {PLAYERS.map((name, id) => {
          const pos = order.indexOf(id);
          const [x, y] = pos < 4 ? COURT[pos] : LINE[pos - 4];
          return (
            <span
              key={name}
              className={`absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-semibold transition-all duration-900 ease-[cubic-bezier(.6,.05,.3,1)] motion-reduce:transition-none ${
                pos < 4 ? "bg-ball text-ball-dark ring-2 ring-court-deep" : "bg-white/15 text-white"
              }`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {name}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-white/60">Two players rotate off after each game, and the next two in line step on.</p>
    </div>
  );
}
