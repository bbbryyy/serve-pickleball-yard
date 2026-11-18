// Pure store helpers (shared by server and client code).

export type PayMethod = "cash" | "gcash" | "maya";
export type Money3 = { cash: number; gcash: number; maya: number };
export type StoreDaily = { date: string; method: PayMethod; revenue: number; cost: number };

export const PAYMENT_LABEL: Record<PayMethod, string> = { cash: "Cash", gcash: "GCash", maya: "Maya" };

export function cartTotal(lines: { qty: number; price: number }[]): number {
  return lines.reduce((t, l) => t + l.qty * l.price, 0);
}

/** Counted minus expected for each method (negative = short). */
export function closeDiff(expected: Money3, counted: Money3): Money3 & { total: number } {
  const cash = counted.cash - expected.cash;
  const gcash = counted.gcash - expected.gcash;
  const maya = counted.maya - expected.maya;
  return { cash, gcash, maya, total: cash + gcash + maya };
}

export function isLow(onHand: number, lowAt: number | null): boolean {
  return lowAt !== null && onHand <= lowAt;
}
