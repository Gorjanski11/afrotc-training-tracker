import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TrainingObjective } from "../domain/types";

interface Props {
  catalog: TrainingObjective[];
  value: string[];
  onChange: (objectiveIds: string[]) => void;
}

export function TrainingObjectiveMultiSelect({ catalog, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {value.length === 0 ? "Select Training Objectives covered..." : `${value.length} objective${value.length === 1 ? "" : "s"} selected`}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <Command>
          <CommandInput placeholder="Search by number or title..." />
          <CommandList>
            <CommandEmpty>No Training Objective found.</CommandEmpty>
            <CommandGroup>
              {catalog.map((objective) => (
                <CommandItem key={objective.id} value={`${objective.number} ${objective.title}`} onSelect={() => toggle(objective.id)}>
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", selected.has(objective.id) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">
                    <strong>{objective.number}</strong> — {objective.title}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
