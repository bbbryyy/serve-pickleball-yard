import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";
import { cartTotal, closeDiff, isLow } from "./store";

describe("store helpers", () => {
  it("adds up a cart", () => {
    expect(cartTotal([{ qty: 2, price: 50 }, { qty: 1, price: 80 }])).toBe(180);
    expect(cartTotal([])).toBe(0);
  });
  it("shows counted minus expected per method", () => {
    expect(closeDiff({ cash: 3540, gcash: 5260, maya: 1200 }, { cash: 3520, gcash: 5260, maya: 1250 })).toEqual({ cash: -20, gcash: 0, maya: 50, total: 30 });
  });
  it("flags low stock at the warning level", () => {
    expect(isLow(5, 5)).toBe(true);
    expect(isLow(6, 5)).toBe(false);
    expect(isLow(0, null)).toBe(false);
  });
});

describe("store error messages", () => {
  it("names the item that ran out", () => {
    expect(friendlyError("not_enough_stock:Gatorade:2")).toBe("Only 2 Gatorade left.");
    expect(friendlyError("not_enough_stock:Coke:0")).toBe("Coke is out of stock.");
  });
  it("explains closed days and corrections", () => {
    expect(friendlyError("day_closed")).toBe("Today's store is already closed. Ask an admin to reopen it.");
    expect(friendlyError("already_closed")).toBe("This day is already closed.");
    expect(friendlyError("not_same_day")).toBe("Only an admin can cancel a sale from an earlier day.");
    expect(friendlyError("stock_below_zero")).toBe("That would take stock below zero.");
  });
});
