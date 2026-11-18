"use client";

import { useState, useTransition } from "react";
import { reopenDay } from "../../../../store-actions";

export function ReopenButton({ closeId }: { closeId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="text-court underline"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Reopen this day? Staff will need to count and close it again.")) return;
          start(async () => { const r = await reopenDay(closeId); setError(r.error ?? null); });
        }}
      >
        Reopen
      </button>
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </>
  );
}
