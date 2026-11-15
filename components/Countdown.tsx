"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Countdown({ until }: { until: string }) {
  const end = new Date(until).getTime();
  const [left, setLeft] = useState<number | null>(null);
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      const ms = end - Date.now();
      setLeft(ms);
      if (ms <= 0) router.refresh();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [end, router]);
  if (left === null) return <span>--:--</span>;
  if (left <= 0) return <span>expired</span>;
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="tabular-nums">{h ? `${h}:` : ""}{mm}:{ss}</span>;
}
