import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RosterSearchSelect } from "./RosterSearchSelect";
import { DEV_LEVELS, FLIGHTS, PROFICIENCY_CODES, type DevLevel, type Flight, type ProficiencyCode } from "../domain/constants";
import { getLookForCriteria } from "../domain/proficiencyCriteria";
import { compareByLastName } from "../domain/nameUtils";
import { cn } from "@/lib/utils";
import type { CompletionInput } from "../hooks/useCompletions";
import type { Cadet, Completion, TrainingObjective } from "../domain/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The cadet whose cell/row was clicked to open this dialog -- always included when Multiple Partial is used. */
  cadet: Cadet;
  cadets: Cadet[];
  objective: TrainingObjective;
  requiredProficiency: ProficiencyCode;
  /** Which PMT occurrence this entry applies to -- undefined for objectives that only ever occur once. */
  pmtEventId?: string;
  existingCompletion?: Completion;
  createCompletion: (input: CompletionInput) => Promise<Completion>;
  updateCompletion: (id: string, input: CompletionInput) => Promise<Completion>;
  /**
   * Only offered for objectives whose material is split across several PMT occurrences: lets one
   * evaluation apply identically to a whole group of cadets at once, since everyone at that session
   * typically covered the same material together. Needs a way to find each additional cadet's
   * existing completion for this same objective+occurrence, to update rather than duplicate it.
   */
  allowMultiplePartial?: boolean;
  findExistingCompletion?: (cadetId: string) => Completion | undefined;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CompletionEntryDialog({
  open,
  onClose,
  cadet,
  cadets,
  objective,
  requiredProficiency,
  pmtEventId,
  existingCompletion,
  createCompletion,
  updateCompletion,
  allowMultiplePartial,
  findExistingCompletion,
}: Props) {
  const [proficiency, setProficiency] = useState<ProficiencyCode>(existingCompletion?.proficiencyAchieved ?? requiredProficiency);
  const [dateCompleted, setDateCompleted] = useState(existingCompletion?.dateCompleted?.slice(0, 10) ?? todayIso());
  const [evaluator, setEvaluator] = useState(existingCompletion?.evaluator ?? "");
  const [notes, setNotes] = useState(existingCompletion?.notes ?? "");
  const [multiplePartial, setMultiplePartial] = useState(false);
  const [selectedCadetIds, setSelectedCadetIds] = useState<Set<string>>(() => new Set([cadet.id]));
  const [cadetSearch, setCadetSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<DevLevel | "All">("All");
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const criteria = getLookForCriteria(objective);

  const toggleCadet = (id: string) => {
    setSelectedCadetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Scoped to whichever cadets were actually passed in (already the cohort's roster), so these
  // filters only ever offer the levels/flights that are actually relevant here.
  const availableLevels = useMemo(() => DEV_LEVELS.filter((l) => cadets.some((c) => c.devLevel === l)), [cadets]);
  const availableFlights = useMemo(() => FLIGHTS.filter((f) => cadets.some((c) => c.flight === f)), [cadets]);

  const searchedCadets = useMemo(
    () =>
      [...cadets]
        .filter((c) => c.name.toLowerCase().includes(cadetSearch.trim().toLowerCase()))
        .filter((c) => levelFilter === "All" || c.devLevel === levelFilter)
        .filter((c) => flightFilter === "All" || c.flight === flightFilter)
        .sort((a, b) => compareByLastName(a.name, b.name)),
    [cadets, cadetSearch, levelFilter, flightFilter]
  );

  const handleSave = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const targets = multiplePartial ? cadets.filter((c) => selectedCadetIds.has(c.id)) : [cadet];
      for (const target of targets) {
        const existing = target.id === cadet.id ? existingCompletion : findExistingCompletion?.(target.id);
        const input: CompletionInput = {
          cadetId: target.id,
          cadetName: target.name,
          objectiveId: objective.id,
          objectiveNumber: objective.number,
          proficiencyAchieved: proficiency,
          dateCompleted,
          evaluator,
          notes,
          pmtEventId,
          // Opened via Quick Log's "Partial" flow -- true regardless of which proficiency code gets
          // entered, since it's the evaluator vouching only for this occurrence's own material, not
          // a definitive session pass. The plain Pass toggle and Cadet Detail's log dialog never set this.
          partial: !!allowMultiplePartial,
        };
        if (existing) await updateCompletion(existing.id, input);
        else await createCompletion(input);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existingCompletion ? "Edit" : "Log"} Training Objective {objective.number} for {cadet.name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm">{objective.title}</p>
        <p className="text-sm text-muted-foreground">
          Required proficiency at {cadet.devLevel}: <strong>{requiredProficiency}</strong>
        </p>

        {criteria.length > 0 && (
          <div className="grid gap-2 rounded-md border border-input bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">What should've been observed, by proficiency level:</p>
            {criteria.map((c) => (
              <div key={c.code} className={cn("rounded-md p-2", c.code === proficiency && "bg-accent")}>
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant={c.code === proficiency ? "default" : "outline"}>{c.code}</Badge>
                  <span className="text-xs font-medium">{c.label}</span>
                </div>
                <p className="mb-1 text-xs text-muted-foreground">{c.frame}</p>
                <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {c.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Proficiency achieved *</Label>
            <Select value={proficiency} onValueChange={(v) => setProficiency(v as ProficiencyCode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFICIENCY_CODES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Date completed *</Label>
            <Input type="date" value={dateCompleted} onChange={(e) => setDateCompleted(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>Evaluator</Label>
            <RosterSearchSelect cadets={cadets} value={evaluator} onChange={setEvaluator} placeholder="Optional" />
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          {allowMultiplePartial && (
            <div className="grid gap-2 rounded-md border border-input p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={multiplePartial} onChange={(e) => setMultiplePartial(e.target.checked)} />
                Multiple Partial -- apply this exact evaluation to several cadets at once
              </label>
              {multiplePartial && (
                <div className="grid gap-2">
                  <Input
                    placeholder="Filter cadets..."
                    value={cadetSearch}
                    onChange={(e) => setCadetSearch(e.target.value)}
                    className="h-8"
                  />
                  <div className="flex gap-2">
                    {availableLevels.length > 0 && (
                      <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as DevLevel | "All")}>
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue placeholder="Level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All levels</SelectItem>
                          {availableLevels.map((l) => (
                            <SelectItem key={l} value={l}>
                              {l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {availableFlights.length > 0 && (
                      <Select value={flightFilter} onValueChange={(v) => setFlightFilter(v as Flight | "All")}>
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue placeholder="Flight" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All flights</SelectItem>
                          {availableFlights.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f} Flight
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-input p-2">
                    {searchedCadets.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
                        <input type="checkbox" checked={selectedCadetIds.has(c.id)} onChange={() => toggleCadet(c.id)} />
                        {c.name}
                      </label>
                    ))}
                    {searchedCadets.length === 0 && <p className="p-1 text-xs text-muted-foreground">No cadets match.</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedCadetIds.size} cadet(s) selected.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !dateCompleted || (multiplePartial && selectedCadetIds.size === 0)}>
            {saving ? "Saving..." : multiplePartial ? `Save (${selectedCadetIds.size})` : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
