import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compareByLastName } from "../../domain/nameUtils";
import type { Cadet } from "../../domain/types";

interface Props {
  /** Already filtered to whoever is eligible (e.g. `getAuthorizedDeviationAssigners`) -- this component doesn't apply any scoping itself. */
  people: Cadet[];
  /** Selected person's email, or "" for none. Cadets without an email on file can't be selected here since identity matching needs one. */
  value: string;
  onChange: (email: string, name: string) => void;
  placeholder?: string;
  className?: string;
}

/** Searchable single-select over a pre-filtered roster subset, keyed by email (not cadetId) -- used for the Deviation Memo "Assigned by" field (Section 7), which needs a stable identity to scope assign/review access by. */
export function PersonCombobox({ people, value, onChange, placeholder = "Select a person...", className }: Props) {
  const [open, setOpen] = useState(false);
  const eligible = useMemo(() => people.filter((p) => !!p.email), [people]);
  const sorted = useMemo(() => [...eligible].sort((a, b) => compareByLastName(a.name, b.name)), [eligible]);
  const selected = eligible.find((p) => p.email?.trim().toLowerCase() === value.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-64 justify-between font-normal", className)}>
          {selected ? selected.name : placeholder}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Type a name..." />
          <CommandList>
            <CommandEmpty>No one found.</CommandEmpty>
            <CommandGroup>
              {sorted.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onChange(p.email as string, p.name);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", p.email?.trim().toLowerCase() === value.trim().toLowerCase() ? "opacity-100" : "opacity-0")} />
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
