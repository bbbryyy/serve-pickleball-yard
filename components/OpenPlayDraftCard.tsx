"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createSessionFromDink } from "@/app/backoffice/open-play-actions";
import type { OpenPlayDraft } from "@/lib/agent/openPlayDraft";
import { formatPeso } from "@/lib/schedule";

/** An open play session Dink drafted for the owner, with a button to create it. */
export function OpenPlayDraftCard({ draft }: { draft: OpenPlayDraft }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: string; error?: string; code?: string; sessionId?: string } | null>(null);

  function create() {
    start(async () =>
      setResult(
        await createSessionFromDink({ date: draft.date, fromHour: draft.fromHour, toHour: draft.toHour, courtIds: draft.courtIds, note: draft.note }),
      ),
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-kitchen p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">New open play session</p>
        <p className="text-xs text-steel/70">{formatPeso(draft.fee)} per player</p>
      </div>
      <p className="mt-1 text-sm">
        {draft.dateLabel} · {draft.hoursLabel}
      </p>
      <p className="text-sm">
        {draft.courtNames.join(" and ")} · up to {draft.maxPlayers} players
      </p>
      {draft.note && <p className="text-sm text-steel/70">Note: {draft.note}</p>}
      {result?.ok ? (
        <p className="mt-2 text-sm text-court" role="status">
          Created {result.code}.{" "}
          <Link href={`/backoffice/open-play/${result.sessionId}`} className="font-semibold underline">
            Open the session page
          </Link>{" "}
          to share the payment link.
        </p>
      ) : (
        <>
          <button type="button" onClick={create} disabled={pending} className="btn-primary mt-2 w-full rounded-full py-1.5 text-sm">
            {pending ? "Creating…" : "Create session"}
          </button>
          <p className="mt-1 text-[11px] text-steel/70">Fee and players per court come from Settings.</p>
          {result?.error && (
            <p className="mt-1 text-xs text-red-700" role="alert">
              {result.error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
