import { useState } from "react";
import { X } from "lucide-react";
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
 * these instead of showing its desktop TabsList/sidebar. Pulls out from the left edge by swiping from
 * the screen's outermost edge, or by tapping the small handle tab left peeking in -- rotates to the
 * bottom edge in landscape, where it swaps places with LiquidTabBar (which moves to the right edge).
 * Deliberately plain/solid (not ".glass", no spring physics) so it reads as a distinct, simpler
 * control from the Liquid Glass bottom bar -- matches the reference "Objects" sidebar's flat style.
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
              "absolute rounded-e-md bg-foreground/70 shadow-md",
              "left-0 top-1/2 h-12 w-2.5 -translate-y-1/2",
              "phone:landscape:left-1/2 phone:landscape:top-auto phone:landscape:bottom-0 phone:landscape:h-2.5 phone:landscape:w-12 phone:landscape:-translate-x-1/2 phone:landscape:translate-y-0 phone:landscape:rounded-e-none phone:landscape:rounded-t-md"
            )}
          />
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 hidden bg-foreground/30 phone:block"
          onClick={closeIt}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          "fixed z-50 hidden -translate-x-full flex-col bg-card text-card-foreground shadow-xl transition-transform duration-200 ease-out phone:flex",
          "inset-y-0 left-0 w-64",
          "phone:landscape:inset-x-0 phone:landscape:inset-y-auto phone:landscape:bottom-0 phone:landscape:left-0 phone:landscape:h-20 phone:landscape:w-auto phone:landscape:translate-x-0 phone:landscape:translate-y-full phone:landscape:flex-row phone:landscape:items-stretch",
          open && "translate-x-0 phone:landscape:translate-y-0"
        )}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-input px-3 py-2 phone:landscape:hidden">
          <span className="text-sm font-semibold">{title}</span>
          <button type="button" onClick={closeIt} aria-label="Close navigation" className="rounded-full p-1.5 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 phone:landscape:flex-row phone:landscape:items-center phone:landscape:justify-around phone:landscape:gap-1 phone:landscape:overflow-x-auto phone:landscape:p-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.value === active;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  onChange(item.value);
                  closeIt();
                }}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm",
                  "phone:landscape:flex-col phone:landscape:gap-0.5 phone:landscape:px-2.5 phone:landscape:py-1 phone:landscape:text-[10px]",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
