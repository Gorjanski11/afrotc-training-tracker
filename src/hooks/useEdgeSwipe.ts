import { useCallback, useRef } from "react";

interface Options {
  /** Which screen edge this gesture opens from -- "left" in portrait, "bottom" once rotated (landscape swaps the sidebar to the bottom edge, matching the LiquidTabBar moving to the side). */
  edge: "left" | "bottom";
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
      if (edge === "left") {
        if (Math.abs(dy) >= Math.abs(dx)) return;
        if (!isOpen && dx > threshold) onOpen();
        else if (isOpen && dx < -threshold) onClose();
      } else {
        if (Math.abs(dx) >= Math.abs(dy)) return;
        if (!isOpen && dy < -threshold) onOpen();
        else if (isOpen && dy > threshold) onClose();
      }
    },
    [edge, isOpen, onOpen, onClose, threshold]
  );

  return { onTouchStart, onTouchEnd };
}
