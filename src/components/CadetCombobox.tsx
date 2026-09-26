import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compareByLastName } from "../domain/nameUtils";
import type { Cadet } from "../domain/types";

interface Props {
  cadets: Cadet[];
  value: string;
  onChange: (cadetId: string) => void;
  className?: string;
}

function sortByLastName(cadets: Cadet[]): Cadet[] {
  return [...cadets].sort((a, b) => compareByLastName(a.name, b.name));
}

/** Cadre supervise, they're never a selectable subject (Section 4) -- filtered here so every caller gets this for free. */
export function CadetCombobox({ cadets, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const trackable = useMemo(() => cadets.filter((c) => !c.isCadre), [cadets]);
  const sorted = useMemo(() => sortByLastName(trackable), [trackable]);
  const selected = trackable.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-64 justify-between font-normal", className)}>
          {selected ? `${selected.name} (${selected.devLevel ?? "no level"})` : "Select a cadet..."}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <Command>
          <CommandInput placeholder="Type a name..." />
          <CommandList>
            <CommandEmpty>No cadet found.</CommandEmpty>
            <CommandGroup>
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
                  {c.name} ({c.devLevel ?? "no level"})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
