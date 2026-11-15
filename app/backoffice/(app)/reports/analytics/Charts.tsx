"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { label: string; bookings: number; hours: number; revenue: number };

export function BarSeries({ data, highlight }: { data: Point[]; highlight?: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e7e9ec" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5a6270" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={{ fontSize: 11, fill: "#5a6270" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgb(31 95 191 / 0.08)" }}
            formatter={(v, name) => (name === "Revenue" ? `₱${Number(v).toLocaleString()}` : v)}
            contentStyle={{ borderRadius: 8, border: "1px solid #e7e9ec", fontSize: 12 }}
          />
          <Bar dataKey="hours" name="Hours booked" fill="#1f5fbf" radius={[3, 3, 0, 0]} shape={(props: unknown) => {
            const p = props as { x: number; y: number; width: number; height: number; payload: Point };
            return <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={3} fill={p.payload.label === highlight ? "#d98a4e" : "#1f5fbf"} />;
          }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
