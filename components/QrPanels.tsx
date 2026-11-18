import type { PaymentAccount } from "@/lib/settings";

/** GCash and Maya QR codes side by side (used by court booking and open play payment pages). */
export function QrPanels({ gcash, maya }: { gcash: PaymentAccount; maya: PaymentAccount }) {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {[
        { name: "GCash", acct: gcash, ring: "border-[#0a6cff]", text: "text-[#0a4fb8]" },
        { name: "Maya", acct: maya, ring: "border-[#00a651]", text: "text-[#00753a]" },
      ].map(({ name, acct, ring, text }) => (
        <div key={name} className={`card border-2 ${ring} p-4 text-center`}>
          <p className={`font-display text-xl font-semibold ${text}`}>{name}</p>
          {acct.qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={acct.qrUrl} alt={`${name} QR code`} className="mx-auto mt-3 aspect-square w-full max-w-[240px] rounded object-contain" />
          ) : (
            <div className="mx-auto mt-3 flex aspect-square w-full max-w-[240px] items-center justify-center rounded bg-paper p-4 text-sm text-steel/60">
              QR code coming soon. Ask our staff for payment details.
            </div>
          )}
          {(acct.name || acct.number) && (
            <p className="mt-3 text-sm text-steel">
              {acct.name}
              {acct.number && <span className="block font-semibold">{acct.number}</span>}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
