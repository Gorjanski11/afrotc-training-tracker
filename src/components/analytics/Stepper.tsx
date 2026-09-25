import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Prev/next "slider" through a small set of options -- one at a time, rather than a dropdown -- used wherever the plan calls for a slider over Flights/Groups/PMT types. */
export function Stepper({ options, value, onChange, className }: Props) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index];

  const step = (delta: number) => {
    if (options.length === 0) return;
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => step(-1)} disabled={options.length <= 1} aria-label="Previous">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-24 text-center text-sm font-medium">{current?.label ?? "—"}</span>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => step(1)} disabled={options.length <= 1} aria-label="Next">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
