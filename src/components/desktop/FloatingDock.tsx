import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface FloatingDockItem<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Props<T extends string> {
  items: FloatingDockItem<T>[];
  active: T;
  onChange: (value: T) => void;
  /** "horizontal" centers at the bottom of the screen (the hub's main tabs); "vertical" centers on the left edge (a sub-app's own sub-screens). */
  orientation: "horizontal" | "vertical";
  ariaLabel: string;
}

/**
 * Desktop-only floating pill nav -- always fully visible (no swipe-to-open/collapse, unlike
 * EdgeSidebar/LiquidTabBar's phone equivalents, since desktop has the screen real estate and no touch
 * gesture to rely on), icon-only circular buttons with a hover tooltip for the label.
 *
 * Portaled to <body> for the same containing-block reason EdgeSidebar is -- most call sites render
 * inside a sub-app that's wrapped in App.tsx's AnimatedPanel (a motion.div that keeps an inline
 * `transform` even at rest), which would otherwise turn `position: fixed` into "fixed relative to that
 * ancestor" instead of the real viewport.
 */
export function FloatingDock<T extends string>({ items, active, onChange, orientation, ariaLabel }: Props<T>) {
  const vertical = orientation === "vertical";
  return createPortal(
    <nav
      className={cn(
        "fixed z-40 hidden items-center rounded-full bg-foreground shadow-xl desktop:flex",
        vertical ? "left-4 top-1/2 w-14 -translate-y-1/2 flex-col gap-1 py-3" : "inset-x-0 bottom-4 mx-auto w-fit flex-row gap-1.5 px-3 py-2"
      )}
      role="navigation"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.value === active;
        return (
          <div key={item.value} className="group relative flex shrink-0">
            <span
              className={cn(
                "pointer-events-none absolute whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100",
                vertical ? "left-full top-1/2 ms-2 -translate-y-1/2" : "bottom-full left-1/2 mb-2 -translate-x-1/2"
              )}
            >
              {item.label}
            </span>
            <button
              type="button"
              onClick={() => onChange(item.value)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                isActive ? "bg-background text-foreground" : "text-background/70 hover:text-background"
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          </div>
        );
      })}
    </nav>,
    document.body
  );
}
