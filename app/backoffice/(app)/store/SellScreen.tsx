"use client";

import { useState, useTransition } from "react";
import { formatPeso } from "@/lib/schedule";
import { PAYMENT_LABEL, cartTotal, isLow, type PayMethod } from "@/lib/store";
import type { CatalogItem } from "@/lib/storeData";
import type { ActionResult } from "../../actions";
import { cancelSale, createSale } from "../../store-actions";

export type TodaySale = { id: string; method: PayMethod; total: number; status: string; createdAt: string; items: string };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export function SellScreen({ items, sales, closed }: { items: CatalogItem[]; sales: TodaySale[]; closed: boolean }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PayMethod>("cash");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const lines = items.filter((i) => cart[i.id]).map((i) => ({ item: i, qty: cart[i.id] }));
  const total = cartTotal(lines.map((l) => ({ qty: l.qty, price: l.item.price })));
  const add = (i: CatalogItem, d: number) =>
    setCart((c) => {
      const next = Math.max(0, (c[i.id] ?? 0) + d);
      if (i.kind === "shelf" && next > (i.on_hand ?? 0)) return c;
      const copy = { ...c };
      if (next === 0) delete copy[i.id];
      else copy[i.id] = next;
      return copy;
    });
  const completed = sales.filter((s) => s.status === "completed");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        {items.length === 0 ? (
          <p className="card p-6 text-sm text-steel/70">No items yet. An admin can add them under Items.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {items.map((i) => {
              const out = i.kind === "shelf" && (i.on_hand ?? 0) - (cart[i.id] ?? 0) <= 0;
              const low = i.kind === "shelf" && isLow(i.on_hand ?? 0, i.low_stock_at);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={closed || out}
                    onClick={() => add(i, 1)}
                    className="relative flex h-full min-h-20 w-full flex-col items-start justify-between rounded-xl border border-kitchen bg-white p-2.5 text-left hover:border-court disabled:opacity-45"
                  >
                    <span className="pr-8 text-sm leading-tight font-semibold text-steel">{i.name}</span>
                    <span className="text-sm font-semibold text-court">{formatPeso(i.price)}</span>
                    <span
                      className={`absolute top-2 right-2 rounded-full px-1.5 text-[10px] font-semibold ${
                        i.kind === "made_to_order" ? "bg-ball/40 text-ball-dark" : (i.on_hand ?? 0) <= 0 ? "bg-red-50 text-red-700" : low ? "bg-surround/20 text-surround-dark" : "bg-kitchen-light text-steel"
                      }`}
                    >
                      {i.kind === "made_to_order" ? "made" : low && (i.on_hand ?? 0) > 0 ? `${i.on_hand} low` : i.on_hand}
                    </span>
                    {cart[i.id] ? <span className="absolute right-2 bottom-2 rounded-full bg-court px-1.5 text-xs font-semibold text-white">×{cart[i.id]}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-4">
        <div className="card space-y-3 p-4 lg:sticky lg:top-8">
          <h2 className="text-sm font-bold text-steel uppercase">Sale</h2>
          {lines.length === 0 ? (
            <p className="text-sm text-steel/60">Tap items to add them.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {lines.map(({ item, qty }) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{qty} × {item.name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" className="h-7 w-7 rounded-full border border-kitchen" aria-label={`One less ${item.name}`} onClick={() => add(item, -1)}>−</button>
                    <button type="button" className="h-7 w-7 rounded-full border border-kitchen" aria-label={`One more ${item.name}`} onClick={() => add(item, 1)}>+</button>
                    <span className="w-14 text-right font-semibold">{formatPeso(qty * item.price)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Paid with">
            {(["cash", "gcash", "maya"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-full border px-2 py-1.5 text-sm font-semibold ${method === m ? "border-court bg-court text-white" : "border-kitchen bg-white text-steel"}`}
              >
                {PAYMENT_LABEL[m]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-lime w-full py-3"
            disabled={pending || closed || lines.length === 0}
            onClick={() =>
              start(async () => {
                const r = await createSale(lines.map((l) => ({ item_id: l.item.id, qty: l.qty })), method);
                setResult(r);
                if (r.ok) {
                  setCart({});
                  setMethod("cash");
                }
              })
            }
          >
            {pending ? "Saving…" : `Save sale · ${formatPeso(total)}`}
          </button>
          {(result.error || result.ok) && (
            <p role="status" className={`text-sm ${result.error ? "text-red-700" : "text-court"}`}>{result.error ?? result.ok}</p>
          )}
        </div>

        <div className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-steel uppercase">Today</h2>
            <span className="text-sm text-steel/70">{completed.length} sale{completed.length === 1 ? "" : "s"} ·{formatPeso(completed.reduce((t, s) => t + s.total, 0))}</span>
          </div>
          {sales.length === 0 ? (
            <p className="text-sm text-steel/60">No sales yet today.</p>
          ) : (
            <ul className="divide-y divide-kitchen-light text-sm">
              {sales.map((s) => (
                <li key={s.id} className="py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={s.status === "cancelled" ? "text-steel/50 line-through" : "text-steel"}>{s.items}</p>
                      <p className="text-xs text-steel/60">{time(s.createdAt)} · {PAYMENT_LABEL[s.method]}{s.status === "cancelled" ? " · Cancelled" : ""}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{formatPeso(s.total)}</p>
                      {s.status === "completed" && !closed && (
                        <button type="button" className="text-xs text-red-700 underline" onClick={() => { setCancelling(s.id); setReason(""); }}>Cancel</button>
                      )}
                    </div>
                  </div>
                  {cancelling === s.id && (
                    <div className="mt-2 flex gap-2">
                      <input className="input flex-1" placeholder="Reason (e.g. wrong item)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for cancelling" />
                      <button
                        type="button"
                        className="btn bg-red-600 px-3 text-white hover:bg-red-700"
                        disabled={pending || !reason.trim()}
                        onClick={() => start(async () => { const r = await cancelSale(s.id, reason); setResult(r); if (r.ok) setCancelling(null); })}
                      >
                        Cancel sale
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
