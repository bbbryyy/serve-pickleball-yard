"use client";

import { useState, useTransition } from "react";
import { formatPeso } from "@/lib/schedule";
import type { StockRow } from "@/lib/storeAdmin";
import type { ActionResult } from "../../../actions";
import { saveItem } from "../../../store-actions";

type Draft = { id: string | null; name: string; kind: "shelf" | "made_to_order"; price: string; servingCost: string; lowStockAt: string; active: boolean; sort: string };
const blank: Draft = { id: null, name: "", kind: "shelf", price: "", servingCost: "", lowStockAt: "5", active: true, sort: "0" };
const toDraft = (r: StockRow): Draft => ({
  id: r.id, name: r.name, kind: r.kind, price: String(r.price), servingCost: r.serving_cost === null ? "" : String(r.serving_cost),
  lowStockAt: r.low_stock_at === null ? "" : String(r.low_stock_at), active: r.active, sort: String(r.sort_order),
});

export function ItemEditor({ items }: { items: StockRow[] }) {
  const [d, setD] = useState<Draft>(blank);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const digits = (v: string) => v.replace(/[^\d.]/g, "");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-steel/60">
            <tr><th className="py-1.5">Item</th><th>Kind</th><th className="text-right">Price</th><th className="text-right">Cost</th><th className="text-right">Warn at</th><th /></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={`border-t border-kitchen-light ${i.active ? "" : "text-steel/50"}`}>
                <td className="py-1.5 font-semibold">{i.name}{!i.active && " (hidden)"}</td>
                <td>{i.kind === "shelf" ? "Shelf" : "Made to order"}</td>
                <td className="text-right">{formatPeso(i.price)}</td>
                <td className="text-right">{i.kind === "shelf" ? `${formatPeso(i.avg_cost)} avg` : formatPeso(i.serving_cost ?? 0)}</td>
                <td className="text-right">{i.low_stock_at ?? "—"}</td>
                <td className="text-right"><button type="button" className="text-court underline" onClick={() => { setD(toDraft(i)); setResult({}); }}>Edit</button></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="py-3 text-steel/60">No items yet. Add your first one.</td></tr>}
          </tbody>
        </table>
      </div>

      <form
        className="card h-fit space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveItem({
              id: d.id, name: d.name, kind: d.kind, price: Number(d.price),
              servingCost: d.kind === "made_to_order" ? Number(d.servingCost) : null,
              lowStockAt: d.kind === "shelf" && d.lowStockAt !== "" ? Number(d.lowStockAt) : null,
              active: d.active, sort: Number(d.sort) || 0,
            });
            setResult(r);
            if (r.ok && !d.id) setD(blank);
          });
        }}
      >
        <h2 className="text-sm font-bold text-steel uppercase">{d.id ? "Edit item" : "Add item"}</h2>
        <div>
          <label className="label" htmlFor="it-name">Name</label>
          <input id="it-name" className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required maxLength={60} placeholder="Gatorade" />
        </div>
        {!d.id && (
          <fieldset>
            <legend className="label">Kind</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {([["shelf", "Shelf item"], ["made_to_order", "Made to order"]] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={d.kind === v} onClick={() => setD({ ...d, kind: v })}
                  className={`rounded-full border px-2 py-1.5 text-sm font-semibold ${d.kind === v ? "border-court bg-court text-white" : "border-kitchen bg-white text-steel"}`}>{l}</button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="it-price">Selling price (₱)</label>
            <input id="it-price" className="input" inputMode="numeric" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value.replace(/\D/g, "") })} required />
          </div>
          {d.kind === "made_to_order" ? (
            <div>
              <label className="label" htmlFor="it-cost">Cost per serving (₱)</label>
              <input id="it-cost" className="input" inputMode="decimal" value={d.servingCost} onChange={(e) => setD({ ...d, servingCost: digits(e.target.value) })} required />
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="it-low">Warn when at</label>
              <input id="it-low" className="input" inputMode="numeric" value={d.lowStockAt} onChange={(e) => setD({ ...d, lowStockAt: e.target.value.replace(/\D/g, "") })} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="it-sort">Order on Sell screen</label>
            <input id="it-sort" className="input" inputMode="numeric" value={d.sort} onChange={(e) => setD({ ...d, sort: e.target.value.replace(/\D/g, "") })} />
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm text-steel">
            <input type="checkbox" className="accent-court" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
            On sale
          </label>
        </div>
        {d.kind === "shelf" && !d.id && <p className="text-xs text-steel/60">After saving, add what&apos;s already on the shelf under Restock with &quot;Opening stock&quot; ticked.</p>}
        <div className="flex gap-2">
          <button className="btn-lime flex-1" disabled={pending}>{pending ? "Saving…" : d.id ? "Save changes" : "Add item"}</button>
          {d.id && <button type="button" className="btn-ghost" onClick={() => { setD(blank); setResult({}); }}>New item</button>}
        </div>
        {(result.error || result.ok) && <p role="status" className={`text-sm ${result.error ? "text-red-700" : "text-court"}`}>{result.error ?? result.ok}</p>}
      </form>
    </div>
  );
}
