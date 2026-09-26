import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compareByLastName } from "../../domain/nameUtils";
import type { Cadet } from "../../domain/types";

export const ALL_CADETS = "__all__";

interface Props {
  roster: Cadet[];
  value: string;
  onChange: (cadetId: string) => void;
  allLabel: string;
  className?: string;
}

/** Same combobox pattern as the other sites, plus a pinned "All cadets" entry at the top so a filter can be cleared by typing/picking it just like any other option. Cadre supervise, they're never a selectable subject (Section 4) -- filtered here so every caller gets this for free. */
export function CadetFilterCombobox({ roster, value, onChange, allLabel, className }: Props) {
  const [open, setOpen] = useState(false);
  const trackable = useMemo(() => roster.filter((c) => !c.isCadre), [roster]);
  const sorted = useMemo(() => [...trackable].sort((a, b) => compareByLastName(a.name, b.name)), [trackable]);
  const selected = value === ALL_CADETS ? undefined : trackable.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-48 justify-between font-normal", className)}>
          <span className="truncate">{selected ? selected.name : allLabel}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Type a name..." />
          <CommandList>
            <CommandEmpty>No cadet found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange(ALL_CADETS);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === ALL_CADETS ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {sorted.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", c.id === value ? "opacity-100" : "opacity-0")} />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
