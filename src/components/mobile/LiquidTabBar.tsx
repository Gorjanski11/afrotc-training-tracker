import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface LiquidTabBarItem<T extends string> {
  value: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Props<T extends string> {
  items: LiquidTabBarItem<T>[];
  active: T;
  onChange: (value: T) => void;
}

/**
 * Phone-only bottom nav for the 7 main hub tabs (Section: App.tsx) -- icons only, no labels, with a
 * frosted "liquid glass" pill that glides/morphs to the selected icon (motion's shared layoutId does
 * the FLIP animation, including across the portrait<->landscape re-layout below). Desktop/tablet keep
 * the existing horizontal TabsList untouched; this never renders there (`desktop:hidden phone:flex`).
 * Rotates to a vertical bar on the right edge in landscape, swapping places with EdgeSidebar's subtab
 * panel (which moves to the bottom edge at the same breakpoint) so the two never collide.
 */
export function LiquidTabBar<T extends string>({ items, active, onChange }: Props<T>) {
  return (
    <nav
      className={cn(
        "glass fixed inset-x-0 bottom-0 z-40 hidden items-center justify-around gap-0.5 border-t px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 phone:flex",
        "phone:landscape:inset-x-auto phone:landscape:inset-y-0 phone:landscape:bottom-auto phone:landscape:right-0 phone:landscape:w-16 phone:landscape:flex-col phone:landscape:justify-center phone:landscape:gap-2 phone:landscape:border-l phone:landscape:border-t-0 phone:landscape:px-1.5 phone:landscape:py-2 phone:landscape:pe-[max(0.375rem,env(safe-area-inset-right))]"
      )}
      aria-label="Main navigation"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.value === active;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            {isActive && (
              <motion.span
                layoutId="liquid-tab-pill"
                className="absolute inset-0 rounded-full bg-primary/15 ring-1 ring-inset ring-primary/30"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <Icon className={cn("relative h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
          </button>
        );
      })}
    </nav>
  );
}
