import { getStaffUser } from "@/lib/auth";
import { getReport } from "@/lib/reports";

export async function GET(request: Request) {
  const user = await getStaffUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Bad range", { status: 400 });
  const { daily, open_play: openPlay, open_play_refunds: refunds, store } = await getReport(from, to);
  const lines = [
    "date,type,court,payment_method,channel,bookings,players,hours,revenue_php",
    ...daily.map((r) => [r.date, "court_rental", `Court ${r.court}`, r.method, r.source, r.bookings, "", r.hours, r.revenue].join(",")),
    ...openPlay.map((r) => [r.date, "open_play", "", r.method, r.source, r.payments, r.players, "", r.revenue].join(",")),
    ...refunds.map((r) => [r.date, "open_play_refund", "", "", "", r.payments, r.players, "", -r.amount].join(",")),
    ...store.map((r) => [r.date, "store", "", r.method, "store", "", "", "", r.revenue].join(",")),
  ].sort((a, b) => (a.startsWith("date,") ? -1 : b.startsWith("date,") ? 1 : a < b ? -1 : 1));
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="serve-sales-${from}-to-${to}.csv"`,
    },
  });
}
