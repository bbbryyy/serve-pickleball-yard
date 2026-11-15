import { getStaffUser } from "@/lib/auth";
import { getReport } from "@/lib/reports";

export async function GET(request: Request) {
  const user = await getStaffUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Bad range", { status: 400 });
  const { daily } = await getReport(from, to);
  const lines = [
    "date,court,payment_method,channel,bookings,hours,revenue_php",
    ...daily.map((r) => [r.date, `Court ${r.court}`, r.method, r.source, r.bookings, r.hours, r.revenue].join(",")),
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="serve-sales-${from}-to-${to}.csv"`,
    },
  });
}
