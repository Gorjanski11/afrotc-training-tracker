import { useState } from "react";
import { cn } from "@/lib/utils";
import { useEdgeSwipe } from "@/hooks/useEdgeSwipe";

export interface EdgeSidebarItem<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Props<T extends string> {
  title: string;
  items: EdgeSidebarItem<T>[];
  active: T;
  onChange: (value: T) => void;
}

/**
 * Phone-only off-canvas subtab nav (Section: mobile nav redesign) -- any main hub tab with its own
 * sub-screens (Training Objectives, Memo Submission, Memo Review, Analytics, Settings) gets one of
 * these instead of showing its desktop TabsList/sidebar. A small floating rounded capsule (icons
 * only, no panel/header) pulls out from the left edge by swiping from the screen's outermost edge, or
 * by tapping the small handle nub left peeking in -- rotates to a horizontal capsule hugging the
 * bottom edge in landscape, where it swaps places with LiquidTabBar (which moves to the right edge).
 */
export function EdgeSidebar<T extends string>({ title, items, active, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const openIt = () => setOpen(true);
  const closeIt = () => setOpen(false);
  const portraitSwipe = useEdgeSwipe({ edge: "left", isOpen: open, onOpen: openIt, onClose: closeIt });
  const landscapeSwipe = useEdgeSwipe({ edge: "bottom", isOpen: open, onOpen: openIt, onClose: closeIt });
  const onTouchStart: React.TouchEventHandler = (e) => {
    portraitSwipe.onTouchStart(e);
    landscapeSwipe.onTouchStart(e);
  };
  const onTouchEnd: React.TouchEventHandler = (e) => {
    portraitSwipe.onTouchEnd(e);
    landscapeSwipe.onTouchEnd(e);
  };

  return (
    <>
      {/* Edge swipe-catcher strip, always present so a swipe works even while closed; widened slightly past the visible handle for an easier grab target. */}
      <div
        className={cn(
          "fixed z-40 hidden phone:block",
          "inset-y-0 left-0 w-6",
          "phone:landscape:inset-x-0 phone:landscape:inset-y-auto phone:landscape:bottom-0 phone:landscape:left-0 phone:landscape:h-6 phone:landscape:w-auto"
        )}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {!open && (
          <button
            type="button"
            onClick={openIt}
            aria-label={`Open ${title} navigation`}
            className={cn(
              "absolute rounded-full bg-foreground/80 shadow-md",
              "left-1.5 top-1/2 h-9 w-2 -translate-y-1/2",
              "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-1.5 phone:landscape:h-2 phone:landscape:w-9 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0"
            )}
          />
        )}
      </div>

      {open && <div className="fixed inset-0 z-40 hidden bg-foreground/10 phone:block" onClick={closeIt} aria-hidden="true" />}

      {/* Floating capsule -- vertically centered off the left edge in portrait, horizontally centered off the bottom edge in landscape. */}
      <div
        className={cn(
          "fixed left-3 top-1/2 z-50 hidden w-14 -translate-x-24 -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-foreground py-3 shadow-xl transition-transform duration-200 ease-out phone:flex",
          "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-3 phone:landscape:w-auto phone:landscape:-translate-x-1/2 phone:landscape:translate-y-24 phone:landscape:flex-row phone:landscape:gap-1.5 phone:landscape:px-3 phone:landscape:py-2",
          open && "translate-x-0 phone:landscape:translate-y-0"
        )}
        role="navigation"
        aria-label={`${title} navigation`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.value === active;
          return (
            <div key={item.value} className="relative flex shrink-0">
              {isActive && (
                <span
                  className={cn(
                    "pointer-events-none absolute whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md",
                    "left-full top-1/2 ms-2 -translate-y-1/2",
                    "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-full phone:landscape:ms-0 phone:landscape:mb-2 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0"
                  )}
                >
                  {item.label}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  onChange(item.value);
                  closeIt();
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
    </>
  );
}
