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
  /** The evaluator name string (not a cadet ID -- Evaluator is free text in SharePoint, this is just a roster-backed picker for it). */
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Search-select a name from the roster, for fields (like Evaluator) that store a plain name string rather than a cadet lookup. */
export function RosterSearchSelect({ cadets, value, onChange, disabled, placeholder = "Search the roster..." }: Props) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => [...cadets].sort((a, b) => compareByLastName(a.name, b.name)), [cadets]);

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
          {value || <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
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
                    onChange(c.name);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", c.name === value ? "opacity-100" : "opacity-0")} />
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
