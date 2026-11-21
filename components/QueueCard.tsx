"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveQueue } from "@/app/backoffice/queue-actions";
import { gameCounts, type QueueDraft } from "@/lib/agent/queue";
import { QueueTable } from "./QueueTable";

/** Dink's planned queue in the backoffice chat, with a button for staff to save it to the session. */
export function QueueCard({ draft }: { draft: QueueDraft }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);
  const counts = Object.values(gameCounts(draft.rounds));

  function save() {
    if (draft.replaces && !window.confirm("This session already has a saved queue. Replace it with this one?")) return;
    start(async () => setResult(await saveQueue(draft)));
  }

  return (
    <div className="mt-2 rounded-xl border border-kitchen p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">Open play queue</p>
        <p className="text-xs text-steel/70">{draft.rounds.length} rounds</p>
      </div>
      <p className="text-xs text-steel/70">
        {draft.title} · {draft.players.length} players · {draft.minutesPerGame} min games
        {counts.length > 0 && ` · ${Math.min(...counts)}–${Math.max(...counts)} games each`}
      </p>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-kitchen-light">
        <QueueTable courts={draft.courts} rounds={draft.rounds} playedThrough={draft.playedThrough} compact markNow={false} />
      </div>
      {result?.ok ? (
        <p className="mt-2 text-sm text-court" role="status">
          Saved.{" "}
          <Link href={`/backoffice/open-play/${draft.sessionId}#queue`} className="font-semibold underline">
            Open it on the session page
          </Link>{" "}
          to mark rounds and print.
        </p>
      ) : (
        <>
          <button type="button" onClick={save} disabled={pending} className="btn-primary mt-2 w-full rounded-full py-1.5 text-sm">
            {pending ? "Saving…" : "Save to session"}
          </button>
          {draft.replaces && <p className="mt-1 text-[11px] text-steel/70">This session already has a queue. Saving replaces it{draft.playedThrough > 0 ? "; played rounds stay" : ""}.</p>}
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
