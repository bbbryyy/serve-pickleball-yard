"use client";

import { useEffect, useState } from "react";

// A small top-down court where open play rotates: every few seconds the pair
// that just played steps off to the back of the line and the next two walk on.
const PLAYERS = ["JD", "AR", "MS", "LC", "BT", "CL", "PG", "RL"];
// [left %, top %] inside the stage: 4 court spots, then 4 places in line
const COURT: [number, number][] = [[14, 18], [14, 44], [86, 18], [86, 44]];
const LINE: [number, number][] = [[30, 86], [45, 86], [60, 86], [75, 86]];

export function RotationCourt() {
  const [order, setOrder] = useState(() => PLAYERS.map((_, i) => i));
  const [game, setGame] = useState(1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let side = 1;
    const t = window.setInterval(() => {
      setOrder((o) => {
        const [a, b, c, d, ...line] = o;
        const stay = side ? [a, b] : [c, d];
        const leave = side ? [c, d] : [a, b];
        const next = line.slice(0, 2);
        side = 1 - side;
        return [...(side ? [...next, ...stay] : [...stay, ...next]), ...line.slice(2), ...leave];
      });
      setGame((g) => g + 1);
    }, 3200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="w-[260px] rounded-2xl border border-white/15 bg-court-deep/85 p-3 text-white backdrop-blur-sm" aria-hidden>
      <div className="mb-2 flex justify-between px-1 text-[11px] text-white/70">
        <span>Court 1 · game in progress</span>
        <span>Game {game}</span>
      </div>
      <div className="relative h-[190px]">
        {/* court: blue surface, white lines, kitchen lines either side of the net */}
        <div className="absolute inset-x-1 top-0 h-[116px] rounded-md border-2 border-white bg-court">
          <div className="absolute inset-y-0 left-[30%] w-[20%] border-x-2 border-white/80" />
          <div className="absolute inset-y-0 right-[30%] w-[20%] border-r-2 border-white/80" />
          <div className="absolute -inset-y-1 left-1/2 w-0.5 -translate-x-1/2 bg-white" />
        </div>
        <span className="absolute top-[132px] left-1 text-[11px] text-white/70">Up next</span>
        {PLAYERS.map((name, id) => {
          const pos = order.indexOf(id);
          const [x, y] = pos < 4 ? COURT[pos] : LINE[pos - 4];
          return (
            <span
              key={name}
              className={`absolute flex h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-900 ease-[cubic-bezier(.6,.05,.3,1)] motion-reduce:transition-none ${
                pos < 4 ? "bg-ball text-ball-dark ring-2 ring-court-deep" : "bg-white/15 text-white"
              }`}
              style={{ left: `${x}%`, top: `${(y / 100) * 190}px` }}
            >
              {name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
