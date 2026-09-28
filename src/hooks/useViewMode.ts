import { useCallback, useEffect, useState } from "react";

export type ViewMode = "auto" | "desktop";
const STORAGE_KEY = "afrotc-view-mode";
const DESKTOP_VIEWPORT = "width=1280";
const AUTO_VIEWPORT = "width=device-width, initial-scale=1.0";

/**
 * "Desktop view" is a manual override for someone on a phone who wants the real desktop layout
 * instead of the mobile-optimized one -- rather than maintaining two parallel component trees, it
 * swaps the page's <meta name="viewport"> width, the same trick mobile browsers use for "Request
 * Desktop Site". That makes every Tailwind responsive class (sm:/md:/lg:) evaluate against a
 * simulated 1280px-wide viewport, so the exact same desktop-oriented markup renders as it does on a
 * real desktop, with the phone handling pinch-zoom/pan -- no per-screen special-casing needed. Every
 * screen still only needs to write normal mobile-first responsive classes for "auto" mode.
 */
export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "desktop" ? "desktop" : "auto";
    } catch {
      return "auto";
    }
  });

  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute("content", mode === "desktop" ? DESKTOP_VIEWPORT : AUTO_VIEWPORT);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private browsing / storage blocked -- the toggle still works for this session, just doesn't persist.
    }
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === "auto" ? "desktop" : "auto")), []);

  return { mode, toggle };
}
