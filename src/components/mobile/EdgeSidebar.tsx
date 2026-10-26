import { useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useEdgeSwipe } from "@/hooks/useEdgeSwipe";

export interface EdgeSidebarItem<T extends string> {
  value: T;
  label: string;
  /** Omit for a text-only item (e.g. short abbreviations like "ALL"/"ABS"/"DEV") -- the label itself renders in the circle instead of an icon. */
  icon?: React.ComponentType<{ className?: string }>;
}

interface Props<T extends string> {
  title: string;
  items: EdgeSidebarItem<T>[];
  active: T;
  onChange: (value: T) => void;
  /** "left" (default) is the main subtab sidebar -- pulls out from the left edge in portrait, swaps to
   * hugging the bottom edge in landscape (where it trades places with LiquidTabBar, which moves to the
   * right edge). "right" is for a second, independent sidebar on the same screen (e.g. Memorandum
   * Analytics' mode switcher) -- it mirrors to the right edge in portrait and the top edge in landscape
   * so it never collides with the "left" sidebar or the tab bar, both of which already own the other
   * three edges. */
  side?: "left" | "right";
}

/**
 * Phone-only off-canvas subtab nav (Section: mobile nav redesign) -- any main hub tab with its own
 * sub-screens (Training Objectives, Memo Submission, Memo Review, Analytics, Settings) gets one of
 * these instead of showing its desktop TabsList/sidebar. A small floating rounded capsule (icons
 * only, no panel/header) pulls out from the left edge by swiping from the screen's outermost edge, or
 * by tapping the small handle nub left peeking in -- rotates to a horizontal capsule hugging the
 * bottom edge in landscape, where it swaps places with LiquidTabBar (which moves to the right edge).
 */
export function EdgeSidebar<T extends string>({ title, items, active, onChange, side = "left" }: Props<T>) {
  const isRight = side === "right";
  const [open, setOpen] = useState(false);
  const openIt = () => setOpen(true);
  const closeIt = () => setOpen(false);
  const portraitSwipe = useEdgeSwipe({ edge: isRight ? "right" : "left", isOpen: open, onOpen: openIt, onClose: closeIt });
  const landscapeSwipe = useEdgeSwipe({ edge: isRight ? "top" : "bottom", isOpen: open, onOpen: openIt, onClose: closeIt });
  const onTouchStart: React.TouchEventHandler = (e) => {
    portraitSwipe.onTouchStart(e);
    landscapeSwipe.onTouchStart(e);
  };
  const onTouchEnd: React.TouchEventHandler = (e) => {
    portraitSwipe.onTouchEnd(e);
    landscapeSwipe.onTouchEnd(e);
  };

  // Portaled straight to <body> -- every call site renders this inside App.tsx's AnimatedPanel
  // (a motion.div that keeps an inline `transform` even at rest), and any ancestor `transform`
  // turns `position: fixed` descendants into "fixed relative to that ancestor" instead of the real
  // viewport (CSS containing-block rules). Left in place, the closed-state off-screen translate
  // would get measured against that smaller transformed box instead of the viewport, widening
  // whatever scrollable area contains it and clipping real content on screens that don't scroll
  // that whole page horizontally. Portaling to body sidesteps the whole problem regardless of which
  // ancestor is transformed.
  return createPortal(
    <>
      {/* Edge swipe-catcher strip, always present so a swipe works even while closed; widened slightly past the visible handle for an easier grab target. */}
      <div
        className={cn(
          "fixed z-40 hidden phone:block",
          isRight ? "inset-y-0 right-0 w-6" : "inset-y-0 left-0 w-6",
          isRight
            ? "phone:landscape:inset-x-0 phone:landscape:inset-y-auto phone:landscape:top-0 phone:landscape:left-0 phone:landscape:h-6 phone:landscape:w-auto"
            : "phone:landscape:inset-x-0 phone:landscape:inset-y-auto phone:landscape:bottom-0 phone:landscape:left-0 phone:landscape:h-6 phone:landscape:w-auto"
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
              isRight ? "right-1.5 top-1/2 h-9 w-2 -translate-y-1/2" : "left-1.5 top-1/2 h-9 w-2 -translate-y-1/2",
              isRight
                ? "phone:landscape:left-1/2 phone:landscape:top-1.5 phone:landscape:bottom-auto phone:landscape:h-2 phone:landscape:w-9 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0"
                : "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-1.5 phone:landscape:h-2 phone:landscape:w-9 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0"
            )}
          />
        )}
      </div>

      {open && <div className="fixed inset-0 z-40 hidden bg-foreground/10 phone:block" onClick={closeIt} aria-hidden="true" />}

      {/* Floating capsule -- vertically centered off the near edge in portrait, horizontally centered off the far edge in landscape. */}
      <div
        className={cn(
          "fixed top-1/2 z-50 hidden w-14 -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-foreground py-3 shadow-xl transition-transform duration-200 ease-out phone:flex",
          isRight ? "right-3 translate-x-24" : "left-3 -translate-x-24",
          isRight
            ? "phone:landscape:left-1/2 phone:landscape:top-3 phone:landscape:bottom-auto phone:landscape:w-auto phone:landscape:-translate-x-1/2 phone:landscape:-translate-y-24 phone:landscape:flex-row phone:landscape:gap-1.5 phone:landscape:px-3 phone:landscape:py-2"
            : "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-3 phone:landscape:w-auto phone:landscape:-translate-x-1/2 phone:landscape:translate-y-24 phone:landscape:flex-row phone:landscape:gap-1.5 phone:landscape:px-3 phone:landscape:py-2",
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
              {isActive && open && Icon && (
                <span
                  className={cn(
                    "pointer-events-none absolute whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md",
                    isRight ? "right-full top-1/2 me-2 -translate-y-1/2" : "left-full top-1/2 ms-2 -translate-y-1/2",
                    isRight
                      ? "phone:landscape:left-1/2 phone:landscape:top-full phone:landscape:bottom-auto phone:landscape:me-0 phone:landscape:mt-2 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0"
                      : "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-full phone:landscape:ms-0 phone:landscape:mb-2 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0"
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
                {Icon ? <Icon className="h-5 w-5" /> : <span className="text-[10px] font-bold leading-none">{item.label}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </>,
    document.body
  );
}
