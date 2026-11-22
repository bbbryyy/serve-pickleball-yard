"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DinkChat, type DinkMode } from "./DinkChat";

const STAFF_CHIPS = ["Today's schedule", "Waiting for payment", "Low stock", "Store sales today", "Queue for open play today"];

/** "Ask Dink" for staff and the owner: a sidebar button that opens Dink beside the current page. */
export function BackofficeDink({ firstName, isAdmin }: { firstName: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // the page makes room for the pane on large screens (see .bo-main in globals.css)
  useEffect(() => {
    document.documentElement.dataset.dinkPane = open ? "open" : "";
    return () => {
      document.documentElement.dataset.dinkPane = "";
    };
  }, [open]);

  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const mode: DinkMode = {
    endpoint: "/api/agent/staff",
    subtitle: isAdmin ? "For the owner · can set up open play" : "For staff · reads only, changes nothing",
    greeting: `Hi ${firstName}! Ask me about today's schedule, payments, stock or the store${isAdmin ? ", sales and restocking" : ""}. I can also plan the open play queue${isAdmin ? " and set up open play sessions" : ""}.`,
    chips: isAdmin ? [...STAFF_CHIPS, "Sales this week", "What should I restock?"] : STAFF_CHIPS,
    placeholder: "Ask about today, payments, stock…",
    thinking: "Dink is checking…",
    note: "Dink uses an AI service. It sees first names only, never mobile numbers or emails.",
    layout: "pane",
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-ball px-3 py-2 text-sm font-semibold text-ball-dark hover:brightness-95"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M4 5h16v11H8l-4 4z" />
        </svg>
        Ask Dink
      </button>
      {/* rendered at the end of <body> so no page layer (sticky cards, the sidebar) sits above it */}
      {open && createPortal(<DinkChat onClose={() => setOpen(false)} mode={mode} />, document.body)}
    </>
  );
}
