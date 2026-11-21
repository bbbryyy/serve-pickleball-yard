"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Reloads the queue every 30 seconds (paused while the tab is hidden); prints once when asked to. */
export function QueueRefresh({ print }: { print: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (print) {
      window.print();
      return;
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [print, router]);
  return null;
}
