// Restock suggestions for shelf items (pure: no database, no network).

export type StockItem = { id: string; name: string; onHand: number; lowStockAt: number };

export type RestockSuggestion = {
  name: string;
  onHand: number;
  perDay: number;
  /** null when the item hasn't sold in the period */
  daysLeft: number | null;
  suggest: number;
  low: boolean;
};

/**
 * Average daily units sold over `days`, days of stock left, and how many to buy so stock covers
 * `targetDays` and still stays above the low-stock level. Items that haven't sold and aren't low
 * are left out. Sorted by days left, soonest first.
 */
export function suggestRestock(items: StockItem[], unitsSold: Record<string, number>, days: number, targetDays = 14): RestockSuggestion[] {
  const out: RestockSuggestion[] = [];
  for (const item of items) {
    const sold = unitsSold[item.id] ?? 0;
    const perDay = days > 0 ? sold / days : 0;
    const low = item.onHand <= item.lowStockAt;
    if (sold === 0 && !low) continue;
    // enough for the target days and still one above the low-stock level at the end
    const need = Math.ceil(perDay * targetDays + item.lowStockAt + 1 - item.onHand);
    out.push({
      name: item.name,
      onHand: item.onHand,
      perDay: Math.round(perDay * 10) / 10,
      daysLeft: perDay > 0 ? Math.floor(item.onHand / perDay) : null,
      suggest: Math.max(0, need),
      low,
    });
  }
  return out.sort((x, y) => (x.daysLeft ?? Infinity) - (y.daysLeft ?? Infinity) || y.suggest - x.suggest);
}
