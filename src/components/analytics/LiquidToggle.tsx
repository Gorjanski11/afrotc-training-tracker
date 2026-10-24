import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Unique per instance -- motion's shared layoutId animation would otherwise cross-wire two toggles rendered on the same page at once. */
  layoutId: string;
  className?: string;
}

/**
 * Small two-ish-option segmented switch with a frosted "liquid glass" pill that glides to whichever
 * option is selected -- same sliding-highlight mechanic as LiquidTabBar's bottom nav, scaled down for
 * an inline control. Replaced the old prev/next-arrow Stepper everywhere it was used as a toggle.
 */
export function LiquidToggle<T extends string>({ options, value, onChange, layoutId, className }: Props<T>) {
  return (
    <div className={cn("glass inline-flex items-center gap-0.5 rounded-full border p-0.5", className)}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isActive}
            className="relative rounded-full px-2.5 py-1 text-xs font-medium"
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-primary/15 ring-1 ring-inset ring-primary/30"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <span className={cn("relative", isActive ? "text-primary" : "text-muted-foreground")}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
