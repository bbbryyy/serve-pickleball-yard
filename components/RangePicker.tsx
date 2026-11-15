import Link from "next/link";
import type { RangePreset } from "@/lib/reports";

export function RangePicker({ base, presets, current }: { base: string; presets: RangePreset[]; current: { key: string; from: string; to: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <Link
          key={p.key}
          href={`${base}?range=${p.key}`}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${p.key === current.key ? "bg-steel text-white" : "bg-white text-steel hover:bg-kitchen-light"}`}
        >
          {p.label}
        </Link>
      ))}
      <form action={base} className="flex items-center gap-1 text-sm">
        <input type="date" name="from" defaultValue={current.from} className="input w-auto py-1.5" aria-label="From" />
        <span className="text-steel/60">to</span>
        <input type="date" name="to" defaultValue={current.to} className="input w-auto py-1.5" aria-label="To" />
        <button className="btn-ghost px-3 py-1.5">Apply</button>
      </form>
    </div>
  );
}

export function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold tracking-wide text-steel/60 uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-steel">{value}</p>
      {sub && <p className="text-xs text-steel/60">{sub}</p>}
    </div>
  );
}
