import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { EdgeSidebarItem } from "./EdgeSidebar";

interface Props<T extends string> {
  title: string;
  subtabItems: EdgeSidebarItem<T>[];
  activeSubtab: T;
  onChangeSubtab: (value: T) => void;
  /** Whether the currently active sub-screen actually has any filter controls to show (Cadet Review doesn't) -- purely cosmetic (an empty-state line), the portal target below is always rendered either way. */
  hasFilters: boolean;
  /** The DOM node the active sub-screen portals its own filter controls into (Section: TrainingObjectivesApp) -- always mounted here (just hidden while the subtabs face is showing) so the ref never goes stale when the capsule flips faces. */
  onFilterTargetChange: (el: HTMLDivElement | null) => void;
}

const IDLE_REVERT_MS = 2000;
const SWIPE_THRESHOLD = 36;

/**
 * TO's tab-only floating capsule (Section: mobile nav redesign) -- unlike every other tab's
 * EdgeSidebar, this one never closes: it's a persistent two-face dock that carousels between a
 * filter face (default) and a subtabs face. A swipe "into" the screen from the capsule (right in
 * portrait, up in landscape -- always the same direction as the content it's swiping toward) flips
 * to the other face; picking a subtab or 2s of inactivity on the subtabs face flips back to filter.
 */
export function FilterSubtabDock<T extends string>({
  title,
  subtabItems,
  activeSubtab,
  onChangeSubtab,
  hasFilters,
  onFilterTargetChange,
}: Props<T>) {
  const [mode, setMode] = useState<"filter" | "subtabs">("filter");
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (mode !== "subtabs") return;
    const t = setTimeout(() => setMode("filter"), IDLE_REVERT_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const onTouchStart: React.TouchEventHandler = (e) => {
    const t = e.touches[0];
    if (t) start.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd: React.TouchEventHandler = (e) => {
    const origin = start.current;
    start.current = null;
    if (!origin) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - origin.x;
    const dy = t.clientY - origin.y;
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const swiped = isLandscape
      ? dy < -SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)
      : dx > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy);
    if (swiped) setMode((m) => (m === "filter" ? "subtabs" : "filter"));
  };

  return (
    <div
      className={cn(
        "fixed left-3 top-1/2 z-50 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-[1.75rem] bg-foreground py-3 shadow-xl transition-[width,height] duration-200 ease-out phone:flex",
        "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-3 phone:landscape:h-14 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0 phone:landscape:flex-row phone:landscape:gap-1.5 phone:landscape:px-3 phone:landscape:py-2",
        mode === "filter" ? "w-44 phone:landscape:w-auto" : "w-14 phone:landscape:w-auto"
      )}
      role="navigation"
      aria-label={`${title} navigation`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Filter face -- always mounted (just hidden on the subtabs face) so the portal target ref never goes stale. */}
      <div
        className={cn(
          "w-full flex-col gap-1.5 overflow-y-auto px-2 phone:landscape:w-auto phone:landscape:flex-row phone:landscape:items-center phone:landscape:gap-1.5 phone:landscape:overflow-x-auto phone:landscape:px-1",
          mode === "filter" ? "flex max-h-[65vh]" : "hidden"
        )}
      >
        {!hasFilters && <span className="px-1 py-1.5 text-center text-[11px] text-background/60">No filters here</span>}
        <div ref={onFilterTargetChange} className="contents" />
      </div>

      {/* Subtabs face. */}
      <div
        className={cn(
          "w-full flex-col items-center gap-1 phone:landscape:w-auto phone:landscape:flex-row",
          mode === "subtabs" ? "flex" : "hidden"
        )}
      >
        {subtabItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.value === activeSubtab;
          return (
            <div key={item.value} className="relative flex shrink-0">
              {isActive && (
                <span className="pointer-events-none absolute left-full top-1/2 ms-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-full phone:landscape:ms-0 phone:landscape:mb-2 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0">
                  {item.label}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  onChangeSubtab(item.value);
                  setMode("filter");
                }}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  isActive ? "bg-background text-foreground" : "text-background/70"
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
