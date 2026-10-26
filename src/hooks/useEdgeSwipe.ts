import { useCallback, useRef } from "react";

interface Options {
  /** Which screen edge this gesture opens from -- "left"/"bottom" for the main subtab sidebar ("bottom" once rotated to landscape, matching the LiquidTabBar moving to the side); "right"/"top" for a second, mirrored sidebar (e.g. Memorandum Analytics' mode switcher) that needs the opposite edges so the two don't collide. */
  edge: "left" | "right" | "bottom" | "top";
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Minimum drag distance (px) along the gesture axis before it counts as a swipe, not a tap/scroll. */
  threshold?: number;
}

/**
 * Touch-swipe open/close for EdgeSidebar -- start/end delta only (no live drag-follow visuals), the
 * panel's own CSS transition handles the slide once state flips. Kept separate from EdgeSidebar so
 * TrainingObjectivesApp's two-sidebar swap (Section: TO's filter/subtab sidebars) can reuse the same
 * gesture logic without pulling in EdgeSidebar's own open/close chrome.
 */
export function useEdgeSwipe({ edge, isOpen, onOpen, onClose, threshold = 48 }: Options) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    start.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const origin = start.current;
      start.current = null;
      if (!origin) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - origin.x;
      const dy = t.clientY - origin.y;
      if (edge === "left" || edge === "right") {
        if (Math.abs(dy) >= Math.abs(dx)) return;
        const opens = edge === "left" ? dx > threshold : dx < -threshold;
        const closes = edge === "left" ? dx < -threshold : dx > threshold;
        if (!isOpen && opens) onOpen();
        else if (isOpen && closes) onClose();
      } else {
        if (Math.abs(dx) >= Math.abs(dy)) return;
        const opens = edge === "bottom" ? dy < -threshold : dy > threshold;
        const closes = edge === "bottom" ? dy > threshold : dy < -threshold;
        if (!isOpen && opens) onOpen();
        else if (isOpen && closes) onClose();
      }
    },
    [edge, isOpen, onOpen, onClose, threshold]
  );

  return { onTouchStart, onTouchEnd };
}
