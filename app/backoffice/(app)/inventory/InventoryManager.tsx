"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ItemImage } from "@/components/ItemImage";
import { formatPeso } from "@/lib/schedule";
import { isLow } from "@/lib/store";
import type { StockRow } from "@/lib/storeAdmin";
import type { ActionResult } from "../../actions";
import { addStock, correctStock, saveItem, uploadItemImage } from "../../store-actions";

export type InvItem = StockRow & { imageUrl: string | null };
export type HistoryRow = { id: number; kind: string; qty: number; total_cost: number | null; paid_from: string | null; reason: string | null; created_at: string };

const KIND: Record<string, string> = { opening: "Opening stock", restock: "Restock", sale: "Sale", cancel: "Cancelled sale", correction: "Correction" };
const PAID: Record<string, string> = { owner: "owner", drawer: "drawer", gcash: "GCash", maya: "Maya" };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const cost = (i: InvItem) => (i.kind === "shelf" ? i.avg_cost : i.serving_cost ?? 0);

function Result({ r }: { r: ActionResult }) {
  if (!r.error && !r.ok) return null;
  return <p role="status" className={`text-sm ${r.error ? "text-red-700" : "text-court"}`}>{r.error ?? r.ok}</p>;
}

export function InventoryManager({ items, selectedId, history }: { items: InvItem[]; selectedId: string | null; history: HistoryRow[] }) {
  const selected = items.find((i) => i.id === selectedId) ?? null;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="card overflow-x-auto p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-steel uppercase">Items</h2>
          <Link href="/backoffice/inventory" className="btn-ghost px-3 py-1.5">Add item</Link>
        </div>
        <table className="w-full min-w-[540px] text-sm">
          <thead className="text-left text-xs text-steel/60">
            <tr>
              <th className="w-12" />
              <th className="py-1.5">Item</th>
              <th>Category</th>
              <th className="text-right">In stock</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Price</th>
              <th className="text-right">On sale</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const low = i.kind === "shelf" && isLow(i.on_hand ?? 0, i.low_stock_at);
              return (
                <tr key={i.id} className={`border-t border-kitchen-light ${selectedId === i.id ? "bg-paper" : ""} ${i.active ? "" : "text-steel/50"}`}>
                  <td className="py-1.5"><ItemImage url={i.imageUrl} name={i.name} className="h-10 w-10 rounded-lg [&_span]:hidden [&_svg]:h-4 [&_svg]:w-4" /></td>
                  <td>
                    <Link href={`/backoffice/inventory?item=${i.id}`} className="font-semibold text-steel hover:text-court hover:underline">{i.name}</Link>
                    {i.description && <span className="block max-w-[220px] truncate text-xs text-steel/60">{i.description}</span>}
                  </td>
                  <td className="text-steel/70">{i.kind === "shelf" ? "Shelf" : "Made to order"}</td>
                  <td className={`text-right ${low ? "font-semibold text-surround-dark" : ""}`}>{i.kind === "shelf" ? `${i.on_hand}${low ? " low" : ""}` : "—"}</td>
                  <td className="text-right">{formatPeso(Math.round(cost(i) * 100) / 100)}</td>
                  <td className="text-right">{formatPeso(i.price)}</td>
                  <td className="text-right">{i.active ? "Yes" : "No"}</td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={7} className="py-3 text-steel/60">No items yet. Add your first one.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="space-y-4">
        <ItemForm item={selected} />
        {selected?.kind === "shelf" && <StockForm item={selected} />}
        {selected?.kind === "shelf" && (
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-bold text-steel uppercase">{selected.name} history</h2>
            {history.length === 0 ? (
              <p className="text-sm text-steel/60">No stock changes yet.</p>
            ) : (
              <ul className="divide-y divide-kitchen-light text-sm">
                {history.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {m.kind === "correction" ? (m.reason === "count fix" ? "Count fix" : `Removed · ${m.reason}`) : KIND[m.kind] ?? m.kind}
                      {m.total_cost !== null ? ` · ${formatPeso(m.total_cost)}${m.paid_from ? ` from ${PAID[m.paid_from] ?? m.paid_from}` : ""}` : ""}
                      <span className="block text-xs text-steel/60">{when(m.created_at)}</span>
                    </span>
                    <span className={`font-semibold ${m.qty < 0 ? "text-red-700" : "text-ball-dark"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ItemForm({ item }: { item: InvItem | null }) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [kind, setKind] = useState<"shelf" | "made_to_order">(item?.kind ?? "shelf");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [itemCost, setItemCost] = useState(item ? String(Math.round(cost(item) * 100) / 100) : "");
  const [inStock, setInStock] = useState(item?.kind === "shelf" ? String(item.on_hand ?? 0) : "0");
  const [warnAt, setWarnAt] = useState(item?.low_stock_at === null || item?.low_stock_at === undefined ? (item ? "" : "5") : String(item.low_stock_at));
  const [active, setActive] = useState(item?.active ?? true);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(item?.imageUrl ?? null);
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const num = (v: string) => v.replace(/[^\d.]/g, "");
  const shelf = kind === "shelf";
  const stockChanged = item && shelf && Number(inStock) !== (item.on_hand ?? 0);

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveItem({
            id: item?.id ?? null,
            name,
            kind,
            price: Number(price),
            cost: itemCost === "" ? null : Number(itemCost),
            lowStockAt: shelf && warnAt !== "" ? Number(warnAt) : null,
            inStock: shelf ? Number(inStock || 0) : null,
            description,
            imagePath,
            active,
            sort: item?.sort_order ?? 0,
          });
          setResult(r);
          if (r.ok && !item) {
            setName(""); setDescription(""); setPrice(""); setItemCost(""); setInStock("0"); setImagePath(null); setPreview(null);
          }
          if (r.ok) router.refresh();
        });
      }}
    >
      <h2 className="text-sm font-bold text-steel uppercase">{item ? `Edit ${item.name}` : "Add item"}</h2>
      <div className="flex items-center gap-3">
        <ItemImage url={preview} name={name || "Item"} className="h-20 w-20 shrink-0 rounded-xl" />
        <label className="btn-ghost cursor-pointer px-3 py-1.5 text-sm">
          {uploading ? "Uploading…" : preview ? "Change image" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              const fd = new FormData();
              fd.set("image", f);
              const r = await uploadItemImage(fd);
              setUploading(false);
              if (r.error) setResult({ error: r.error });
              else {
                setImagePath(r.path!);
                setPreview(URL.createObjectURL(f));
                setResult({ ok: "Image ready. Save to keep it." });
              }
            }}
          />
        </label>
      </div>
      <div>
        <label className="label" htmlFor="inv-name">Name</label>
        <input id="inv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Gatorade" />
      </div>
      <div>
        <label className="label" htmlFor="inv-desc">Description</label>
        <input id="inv-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="500ml, assorted flavors" />
      </div>
      {!item && (
        <fieldset>
          <legend className="label">Category</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {([["shelf", "Shelf item"], ["made_to_order", "Made to order"]] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}
                className={`rounded-full border px-2 py-1.5 text-sm font-semibold ${kind === v ? "border-court bg-court text-white" : "border-kitchen bg-white text-steel"}`}>{l}</button>
            ))}
          </div>
        </fieldset>
      )}
      <div className={`grid gap-3 ${shelf ? "grid-cols-3" : "grid-cols-2"}`}>
        {shelf && (
          <div>
            <label className="label" htmlFor="inv-stock">In stock</label>
            <input id="inv-stock" className="input" inputMode="numeric" value={inStock} onChange={(e) => setInStock(e.target.value.replace(/\D/g, ""))} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="inv-cost">{shelf ? "Item cost (₱)" : "Cost per serving (₱)"}</label>
          <input id="inv-cost" className="input" inputMode="decimal" value={itemCost} onChange={(e) => setItemCost(num(e.target.value))} required />
        </div>
        <div>
          <label className="label" htmlFor="inv-price">Selling price (₱)</label>
          <input id="inv-price" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} required />
        </div>
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        {shelf ? (
          <div>
            <label className="label" htmlFor="inv-warn">Track stock: warn at</label>
            <input id="inv-warn" className="input" inputMode="numeric" value={warnAt} onChange={(e) => setWarnAt(e.target.value.replace(/\D/g, ""))} placeholder="5" />
          </div>
        ) : (
          <p className="text-xs text-steel/60">Made-to-order items aren&apos;t counted.</p>
        )}
        <label className="flex items-center gap-2 pb-2 text-sm text-steel">
          <input type="checkbox" className="accent-court" checked={active} onChange={(e) => setActive(e.target.checked)} />
          On sale
        </label>
      </div>
      {stockChanged && <p className="text-xs text-surround-dark">The stock change is saved as a count fix. For a delivery, use Restock below so the cost is averaged in.</p>}
      {!item && shelf && <p className="text-xs text-steel/60">In stock is what&apos;s on the shelf now, at the item cost above.</p>}
      <div className="flex gap-2">
        <button className="btn-lime flex-1" disabled={pending || uploading}>{pending ? "Saving…" : item ? "Save changes" : "Add item"}</button>
      </div>
      <Result r={result} />
    </form>
  );
}

const PAID_FROM = [["owner", "Owner"], ["drawer", "Drawer"], ["gcash", "GCash"], ["maya", "Maya"]] as const;
const REASONS = ["expired", "damaged", "given away", "count fix"] as const;

function StockForm({ item }: { item: InvItem }) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [paidFrom, setPaidFrom] = useState<(typeof PAID_FROM)[number][0]>("owner");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("expired");
  const [result, setResult] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  const n = Number(qty) || 0;
  const after = (item.on_hand ?? 0) + (mode === "add" ? n : -n);

  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = mode === "add"
            ? await addStock({ itemId: item.id, qty: n, totalCost: Number(total), paidFrom, opening: false })
            : await correctStock(item.id, -n, reason);
          setResult(r);
          if (r.ok) { setQty(""); setTotal(""); router.refresh(); }
        });
      }}
    >
      <h2 className="text-sm font-bold text-steel uppercase">Restock or remove</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {([["add", "Restock (add)"], ["remove", "Remove"]] as const).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}
            className={`rounded-full border px-2 py-1.5 text-sm font-semibold ${mode === v ? "border-court bg-court text-white" : "border-kitchen bg-white text-steel"}`}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="sf-qty">Quantity</label>
          <input id="sf-qty" className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="24" required />
        </div>
        {mode === "add" ? (
          <div>
            <label className="label" htmlFor="sf-total">Total paid (₱)</label>
            <input id="sf-total" className="input" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))} placeholder="720" required />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="sf-reason">Reason</label>
            <select id="sf-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REASONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
        )}
      </div>
      {mode === "add" && (
        <fieldset>
          <legend className="label">Paid from</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {PAID_FROM.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={paidFrom === v} onClick={() => setPaidFrom(v)}
                className={`rounded-full border px-2 py-1.5 text-sm font-semibold ${paidFrom === v ? "border-court bg-court text-white" : "border-kitchen bg-white text-steel"}`}>{l}</button>
            ))}
          </div>
          {paidFrom === "drawer" && <p className="mt-1 text-xs text-steel/60">Taken off today&apos;s expected cash at the desk.</p>}
        </fieldset>
      )}
      <p className="text-sm text-steel">
        Stock after: <strong className={after < 0 ? "text-red-700" : ""}>{after}</strong>
        {mode === "remove" && n > 0 && <span className="text-steel/60"> · counted as a loss in the Store Report</span>}
      </p>
      <button className="btn-lime w-full" disabled={pending}>{pending ? "Saving…" : mode === "add" ? "Save restock" : "Remove from stock"}</button>
      <Result r={result} />
    </form>
  );
}
