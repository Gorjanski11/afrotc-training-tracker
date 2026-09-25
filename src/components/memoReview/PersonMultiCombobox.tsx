import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compareByLastName } from "../../domain/nameUtils";
import type { Cadet } from "../../domain/types";
import type { PersonRef } from "../../domain/types";

interface Props {
  /** Already filtered to whoever is eligible (e.g. `getCcEligiblePeople`) -- this component doesn't apply any scoping itself. */
  people: Cadet[];
  value: PersonRef[];
  onChange: (people: PersonRef[]) => void;
  placeholder?: string;
  className?: string;
}

/** Searchable multi-select over a pre-filtered roster subset, keyed by email -- used for the Deviation Memo "CC" field (Section 7). */
export function PersonMultiCombobox({ people, value, onChange, placeholder = "Add people...", className }: Props) {
  const [open, setOpen] = useState(false);
  const eligible = useMemo(() => people.filter((p) => !!p.email), [people]);
  const sorted = useMemo(() => [...eligible].sort((a, b) => compareByLastName(a.name, b.name)), [eligible]);
  const selectedEmails = new Set(value.map((v) => v.email.trim().toLowerCase()));

  const toggle = (p: Cadet) => {
    const email = (p.email as string).trim().toLowerCase();
    if (selectedEmails.has(email)) {
      onChange(value.filter((v) => v.email.trim().toLowerCase() !== email));
    } else {
      onChange([...value, { email: p.email as string, name: p.name }]);
    }
  };

  const remove = (email: string) => onChange(value.filter((v) => v.email !== email));

  return (
    <div className={cn("space-y-1.5", className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <Badge key={v.email} variant="secondary" className="gap-1">
              {v.name}
              <button type="button" onClick={() => remove(v.email)} aria-label={`Remove ${v.name}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-64 justify-between font-normal">
            {placeholder}
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
                  <CommandItem key={p.id} value={p.name} onSelect={() => toggle(p)}>
                    <Check className={cn("mr-2 h-4 w-4", selectedEmails.has(p.email?.trim().toLowerCase() ?? "") ? "opacity-100" : "opacity-0")} />
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
