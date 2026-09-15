import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { getObjectiveStatus, isOverdue } from "../domain/progress";
import { compareByLastName } from "../domain/nameUtils";
import { compareObjectiveNumbers } from "../domain/objectiveGrouping";
import { PROFICIENCY_CODES, type ProficiencyCode } from "../domain/constants";
import type { CompletionInput } from "../hooks/useCompletions";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../domain/types";

type ColumnScope = "overdue" | "overdueAndPastOptional" | "all";

interface Props {
  cadets: Cadet[];
  catalog: TrainingObjective[];
  completions: Completion[];
  pmtEvents: PmtEvent[];
  createCompletion: (input: CompletionInput) => Promise<Completion>;
  updateCompletion: (id: string, input: CompletionInput) => Promise<Completion>;
  deleteCompletion: (id: string) => Promise<void>;
  onSelectCadet: (cadetId: string) => void;
}

/** Every quick-marked entry is attributed to today's date and this evaluator, by design -- to backdate or credit
 *  a different evaluator, edit the entry from Cadet Detail instead (its popup has full date/evaluator control). */
const QUICK_LOG_EVALUATOR = "Cortes Garay, Jorge";

const NONE = "__none__";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function QuickLogScreen({ cadets, catalog, completions, pmtEvents, createCompletion, updateCompletion, deleteCompletion, onSelectCadet }: Props) {
  const [cadetSearch, setCadetSearch] = useState("");
  const [objectiveSearch, setObjectiveSearch] = useState("");
  const [columnScope, setColumnScope] = useState<ColumnScope>("overdue");
  const [showAllCadets, setShowAllCadets] = useState(false);
  const [pending, setPending] = useState<Record<string, string>>({}); // `${cadetId}:${objectiveId}` -> ProficiencyCode | NONE
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  // Loggable = has a proficiency code at ICL or SCL, whether or not the objective is graded.
  // Non-graded-but-leveled objectives are still columns here (available for optional logging);
  // they just never contribute to overdueByCadet below, so they only show by default once
  // "Show all objectives" is checked, never as part of the default overdue-only column set.
  const loggableObjectives = useMemo(() => catalog.filter((o) => o.proficiencyByLevel.ICL !== "" || o.proficiencyByLevel.SCL !== ""), [catalog]);

  const searchedCadets = useMemo(() => {
    const query = cadetSearch.trim().toLowerCase();
    return [...cadets]
      .filter((c) => query === "" || c.name.toLowerCase().includes(query))
      .sort((a, b) => compareByLastName(a.name, b.name));
  }, [cadets, cadetSearch]);

  const completionsByCadet = useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = map.get(c.cadetId) ?? [];
      list.push(c);
      map.set(c.cadetId, list);
    }
    return map;
  }, [completions]);

  /**
   * Per searched cadet: objective ids currently overdue (due/missed, graded only), and separately
   * optional (non-graded) objective ids that have already been covered by at least one PMT event
   * whose date has passed -- the cadet had a real chance to demonstrate it, so it's worth surfacing
   * even though it never counts as overdue.
   */
  const columnEligibilityByCadet = useMemo(() => {
    const map = new Map<string, { overdue: Set<string>; pastOptional: Set<string> }>();
    const now = Date.now();
    for (const cadet of searchedCadets) {
      const overdue = new Set<string>();
      const pastOptional = new Set<string>();
      if (cadet.devLevel) {
        const cadetCompletions = completionsByCadet.get(cadet.id) ?? [];
        for (const objective of loggableObjectives) {
          if (objective.proficiencyByLevel[cadet.devLevel] === "") continue;
          if (objective.graded) {
            const info = getObjectiveStatus(objective, cadet.devLevel, pmtEvents, cadetCompletions);
            if (isOverdue(info.status)) overdue.add(objective.id);
          } else {
            const hasPastPmt = pmtEvents.some((e) => e.objectiveIds.includes(objective.id) && new Date(e.eventDate).getTime() <= now);
            if (hasPastPmt) pastOptional.add(objective.id);
          }
        }
      }
      map.set(cadet.id, { overdue, pastOptional });
    }
    return map;
  }, [searchedCadets, loggableObjectives, pmtEvents, completionsByCadet]);

  /** Default: only cadets who currently have at least one overdue Training Objective. */
  const visibleCadets = useMemo(
    () => (showAllCadets ? searchedCadets : searchedCadets.filter((c) => (columnEligibilityByCadet.get(c.id)?.overdue.size ?? 0) > 0)),
    [searchedCadets, columnEligibilityByCadet, showAllCadets]
  );

  /** Objective ids that are currently overdue for at least one visible cadet. */
  const overdueObjectiveIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cadet of visibleCadets) {
      for (const id of columnEligibilityByCadet.get(cadet.id)?.overdue ?? []) ids.add(id);
    }
    return ids;
  }, [visibleCadets, columnEligibilityByCadet]);

  /** Optional objective ids already covered by a past PMT, for at least one visible cadet. */
  const pastOptionalObjectiveIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cadet of visibleCadets) {
      for (const id of columnEligibilityByCadet.get(cadet.id)?.pastOptional ?? []) ids.add(id);
    }
    return ids;
  }, [visibleCadets, columnEligibilityByCadet]);

  const columns = useMemo(() => {
    const query = objectiveSearch.trim().toLowerCase();
    return loggableObjectives
      .filter((o) => {
        if (columnScope === "all") return true;
        if (columnScope === "overdueAndPastOptional") return overdueObjectiveIds.has(o.id) || pastOptionalObjectiveIds.has(o.id);
        return overdueObjectiveIds.has(o.id);
      })
      .filter((o) => query === "" || o.number.toLowerCase().includes(query) || o.title.toLowerCase().includes(query))
      .sort((a, b) => a.ploOrder - b.ploOrder || compareObjectiveNumbers(a.number, b.number));
  }, [loggableObjectives, columnScope, overdueObjectiveIds, pastOptionalObjectiveIds, objectiveSearch]);

  /**
   * Schedule fact per objective, independent of any cadet: does it still have a future PMT that
   * could cover it? "repeats" = at least one occurrence is still upcoming (another chance later,
   * whether or not one has already passed too). "lastChance" = it's had at least one occurrence
   * and every one of them is already in the past -- nothing left on the calendar to cover it again.
   * "none" = no PMT has ever covered it at all.
   */
  const scheduleStatusByObjective = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, "repeats" | "lastChance" | "none">();
    for (const objective of columns) {
      const occurrences = pmtEvents.filter((e) => e.objectiveIds.includes(objective.id));
      if (occurrences.length === 0) {
        map.set(objective.id, "none");
      } else if (occurrences.some((e) => new Date(e.eventDate).getTime() > now)) {
        map.set(objective.id, "repeats");
      } else {
        map.set(objective.id, "lastChance");
      }
    }
    return map;
  }, [columns, pmtEvents]);

  const cellKey = (cadetId: string, objectiveId: string) => `${cadetId}:${objectiveId}`;

  const getExistingCompletion = (cadetId: string, objectiveId: string): Completion | undefined => {
    return (completionsByCadet.get(cadetId) ?? []).find((c) => c.objectiveId === objectiveId);
  };

  const getCellValue = (cadetId: string, objectiveId: string): string => {
    const key = cellKey(cadetId, objectiveId);
    if (key in pending) return pending[key];
    return getExistingCompletion(cadetId, objectiveId)?.proficiencyAchieved ?? NONE;
  };

  const setCellValue = (cadetId: string, objectiveId: string, value: string) => {
    const key = cellKey(cadetId, objectiveId);
    const existing = getExistingCompletion(cadetId, objectiveId);
    const original = existing?.proficiencyAchieved ?? NONE;
    setPending((prev) => {
      const next = { ...prev };
      if (value === original) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  };

  const dirtyCount = Object.keys(pending).length;

  const handleSave = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      for (const [key, value] of Object.entries(pending)) {
        const [cadetId, objectiveId] = key.split(":");
        const cadet = cadets.find((c) => c.id === cadetId);
        const objective = catalog.find((o) => o.id === objectiveId);
        if (!cadet || !objective) continue;
        const existing = getExistingCompletion(cadetId, objectiveId);

        if (value === NONE) {
          if (existing) await deleteCompletion(existing.id);
          continue;
        }

        const input: CompletionInput = {
          cadetId,
          cadetName: cadet.name,
          objectiveId,
          objectiveNumber: objective.number,
          proficiencyAchieved: value as ProficiencyCode,
          dateCompleted: todayIso(),
          evaluator: QUICK_LOG_EVALUATOR,
          notes: existing?.notes ?? "",
        };
        if (existing) {
          await updateCompletion(existing.id, input);
        } else {
          await createCompletion(input);
        }
      }
      setPending({});
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save one or more entries.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Quick Log</h2>
          <p className="text-sm text-muted-foreground">
            Mark proficiency directly in the grid. Every entry here is logged as today ({todayIso()}) by{" "}
            <strong>{QUICK_LOG_EVALUATOR}</strong> — to backdate an entry or credit a different evaluator, edit it from Cadet Detail instead.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          <Button onClick={handleSave} disabled={dirtyCount === 0 || saving}>
            <Save />
            {saving ? "Saving..." : dirtyCount > 0 ? `Save Changes (${dirtyCount})` : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Filter cadets..." className="pl-8" value={cadetSearch} onChange={(e) => setCadetSearch(e.target.value)} />
        </div>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter Training Objective columns..."
            className="pl-8"
            value={objectiveSearch}
            onChange={(e) => setObjectiveSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showAllCadets} onChange={(e) => setShowAllCadets(e.target.checked)} />
          Show all cadets (default: only those with an overdue Training Objective)
        </label>
        <Select value={columnScope} onValueChange={(v) => setColumnScope(v as ColumnScope)}>
          <SelectTrigger className="w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overdue">Objectives: overdue only (default)</SelectItem>
            <SelectItem value="overdueAndPastOptional">Objectives: overdue + optional ones covered by a past PMT</SelectItem>
            <SelectItem value="all">Objectives: show all</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border border-input">
        <Table aria-label="Quick log grid">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-40 bg-background">Cadet</TableHead>
              {columns.map((objective) => {
                const schedule = scheduleStatusByObjective.get(objective.id) ?? "none";
                return (
                  <TableHead
                    key={objective.id}
                    className={cn(
                      "min-w-28 text-center align-bottom",
                      schedule === "lastChance" ? "bg-destructive/5" : schedule === "repeats" ? "bg-success/5" : undefined
                    )}
                  >
                    {/* background-color bar, not a border -- this project's `* { border-color }` reset silently wins over border-t-* utilities */}
                    <div
                      className="-mx-3 -mt-2.5 mb-1.5 h-1"
                      style={{ background: schedule === "lastChance" ? "var(--destructive)" : schedule === "repeats" ? "var(--success)" : "transparent" }}
                    />
                    <div className="text-xs font-medium">
                      {objective.number}
                      {!objective.graded && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                    </div>
                    <div className="line-clamp-2 text-[11px] font-normal text-muted-foreground" title={objective.title}>
                      {objective.title}
                    </div>
                    {schedule === "lastChance" && <div className="mt-0.5 text-[10px] font-medium text-destructive">Last chance</div>}
                    {schedule === "repeats" && <div className="mt-0.5 text-[10px] font-medium text-success">Repeats later</div>}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleCadets.map((cadet) => (
              <TableRow key={cadet.id}>
                <TableCell className="sticky left-0 z-10 bg-background">
                  <button className="text-left text-primary hover:underline" onClick={() => onSelectCadet(cadet.id)}>
                    {cadet.name}
                  </button>
                  <div className="text-xs text-muted-foreground">{cadet.devLevel ?? "no level"}</div>
                </TableCell>
                {columns.map((objective) => {
                  const schedule = scheduleStatusByObjective.get(objective.id) ?? "none";
                  const tint = schedule === "lastChance" ? "bg-destructive/5" : schedule === "repeats" ? "bg-success/5" : undefined;
                  const applicable = cadet.devLevel && objective.proficiencyByLevel[cadet.devLevel] !== "";
                  if (!applicable) {
                    return (
                      <TableCell key={objective.id} className={cn("text-center text-xs text-muted-foreground", tint)}>
                        N/A
                      </TableCell>
                    );
                  }
                  const key = cellKey(cadet.id, objective.id);
                  const value = getCellValue(cadet.id, objective.id);
                  const isDirty = key in pending;
                  return (
                    <TableCell key={objective.id} className={cn("p-1 text-center", tint)}>
                      <Select value={value} onValueChange={(v) => setCellValue(cadet.id, objective.id, v)}>
                        <SelectTrigger className={cn("h-7 px-2 text-xs", isDirty && "ring-2 ring-primary")}>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>—</SelectItem>
                          {PROFICIENCY_CODES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {visibleCadets.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground">
                  {searchedCadets.length === 0
                    ? "No cadets match this filter."
                    : "No cadets currently have an overdue Training Objective. Check \"Show all cadets\" to log ahead of schedule."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {columns.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No Training Objectives match the current column filter. Widen it with the "Objectives" dropdown above.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-destructive/60" /> Last chance — no future PMT covers this objective
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success/60" /> Repeats later — at least one future PMT still covers it
          </span>
        </div>
      )}
    </div>
  );
}
