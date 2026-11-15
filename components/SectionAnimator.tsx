"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * When a menu link points at a section on the page (/#hours, /#courts, ...),
 * play the section's entrance animation once it scrolls into view.
 * Next.js updates the URL with pushState, which doesn't fire :target or
 * hashchange, so link clicks are watched here instead.
 */
function animate(id: string) {
  const el = document.getElementById(id);
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove("section-enter");
  void el.offsetWidth; // restart the animation if the same link is clicked twice
  el.classList.add("section-enter");
  window.setTimeout(() => el.classList.remove("section-enter"), 1400);
}

export function SectionAnimator() {
  const path = usePathname();

  // arriving from another page with a hash (e.g. /book -> /#coaching)
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => animate(id), 150);
  }, [path]);

  // clicking a section link on this page
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, window.location.href);
      if (url.pathname !== window.location.pathname || !url.hash) return;
      const id = decodeURIComponent(url.hash.slice(1));
      if (document.getElementById(id)) window.setTimeout(() => animate(id), 250);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
