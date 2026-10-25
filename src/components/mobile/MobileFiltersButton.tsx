import { useState } from "react";
import { SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

/**
 * Phone-only small rounded "Filters" pill (replacing the TO's tab's earlier filter/subtabs carousel
 * dock, which tried to cram real filter controls into a narrow capsule) -- tapping it opens a plain
 * popover with the screen's filter controls. Desktop is untouched; it still shows the full inline
 * filter row where it's always been. The caller places this inline (next to the screen's own phone
 * title, typically) rather than this component pinning itself to the viewport, so it can never float
 * on top of and collide with that screen's own top-of-content controls (e.g. a Save button).
 *
 * `icon`/`label` default to the Filters pill; a screen with just a single search box (Reference
 * Library) passes Search/"Search" instead so the button accurately describes what's behind it.
 */
export function MobileFiltersButton({
  children,
  icon: Icon = SlidersHorizontal,
  label = "Filters",
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-input bg-card px-3 py-1.5 text-xs font-medium shadow-sm"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="flex flex-col gap-1.5">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
