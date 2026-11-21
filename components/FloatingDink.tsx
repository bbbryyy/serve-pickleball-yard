"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dink } from "./Dink";
import { DinkChat } from "./DinkChat";

// Manila is UTC+8 with no DST; the yard is closed from 1AM to 4AM.
function closedNow() {
  const h = (new Date().getUTCHours() + 8) % 24;
  return h >= 1 && h < 4;
}
const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};

/**
 * Dink in the lower-right corner of every public page. With the assistant on,
 * the button opens the "Ask Dink" chat; with it off, Dink just says hello.
 */
export function FloatingDink({ chatEnabled = false }: { chatEnabled?: boolean }) {
  const path = usePathname();
  const sleeping = useSyncExternalStore(subscribe, closedNow, () => false);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const wasOpen = useRef(false);
  const close = () => setOpen(false);

  // after the chat closes and the button is visible again, give it focus back
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (chatEnabled) {
    const lift = path === "/book" ? "bottom-24 lg:bottom-4" : "bottom-4";
    return (
      <>
        {open && <DinkChat onClose={close} />}
        <div className={`fixed right-3 z-40 sm:right-5 ${lift} ${open ? "hidden" : ""}`}>
          <button
            ref={button}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-label="Ask Dink: find open courts and get answers"
            className="group relative rounded-full transition-transform hover:scale-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-court"
          >
            <span className="absolute -top-2 right-full mr-1 hidden rounded-full bg-court-deep px-3 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-lg sm:block">
              Ask Dink
            </span>
            <Dink state={sleeping ? "sleep" : "idle"} className="w-16 drop-shadow-lg sm:w-24" />
          </button>
        </div>
      </>
    );
  }

  // keep clear of the booking page's sticky summary bar on phones
  const lift = path === "/book" ? "bottom-24 lg:bottom-4" : "bottom-4";

  return (
    <div className={`fixed right-3 z-40 flex flex-col items-end sm:right-5 ${lift}`}>
      {open && (
        <div
          id="dink-hello"
          role="status"
          className="relative mb-2 w-60 rounded-2xl border border-kitchen-light bg-white p-4 text-sm text-steel shadow-xl"
        >
          <p className="font-semibold">Hi, I&apos;m Dink!</p>
          <p className="mt-1 text-steel/75">
            {sleeping
              ? "I'm napping until the yard opens at 4AM. Soon you'll be able to ask me about open hours and your booking."
              : "Soon you'll be able to ask me about open hours, rates, and your booking right here."}
          </p>
          <span aria-hidden className="absolute -bottom-2 right-10 h-4 w-4 rotate-45 border-r border-b border-kitchen-light bg-white" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="dink-hello"
        aria-label="Dink, the Serve mascot. Ask Dink is coming soon."
        className="rounded-full transition-transform hover:scale-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-court"
      >
        <Dink state={sleeping ? "sleep" : open ? "wave" : "idle"} className="w-16 drop-shadow-lg sm:w-24" />
      </button>
    </div>
  );
}
