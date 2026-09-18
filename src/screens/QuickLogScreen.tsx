import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Save, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { getObjectiveStatus, isOverdue } from "../domain/progress";
import { compareByLastName } from "../domain/nameUtils";
import { compareObjectiveNumbers } from "../domain/objectiveGrouping";
import { DEV_LEVELS, FLIGHTS, PROFICIENCY_CODES, PROFICIENCY_RANK, type DevLevel, type Flight, type ProficiencyCode } from "../domain/constants";
import { ObjectiveExplanationDialog } from "../components/ObjectiveExplanationDialog";
import { CompletionEntryDialog } from "../components/CompletionEntryDialog";
import type { CompletionInput } from "../hooks/useCompletions";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../domain/types";

/**
 * One grid column. Objectives covered by only one PMT get a single column (occurrence is that
 * PMT, or undefined if never scheduled). Objectives whose material is split across several PMTs
 * get one column PER occurrence, each independently gradeable -- there's no cumulative tracking;
 * a Pass logged at any one occurrence is what makes the whole objective read as completed
 * (bestCompletionForObjective already picks the best of however many completions an objective has).
 */
interface QuickLogColumn {
  key: string;
  objective: TrainingObjective;
  occurrence: PmtEvent | undefined;
  isMultiOccurrence: boolean;
}

interface PartialDialogTarget {
  cadet: Cadet;
  objective: TrainingObjective;
  occurrence: PmtEvent;
  requiredCode: ProficiencyCode;
}

type ColumnScope = "overdue" | "overdueAndScheduledOptional" | "all";

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

/** Required-proficiency cells are usually a single code ("P2"), occasionally a composite ("P1/P2") -- Pass fills the lower/first-listed one, the minimum that satisfies the requirement. */
function firstRequiredCode(cell: string): ProficiencyCode | undefined {
  const first = cell.split("/")[0]?.trim();
  return (PROFICIENCY_CODES as readonly string[]).includes(first) ? (first as ProficiencyCode) : undefined;
}

/** Default "Not Pass" selection: the nearest code below the required one (closest to "almost made it"), or the lowest code if the requirement is already the lowest (Ka). */
function defaultNotPassCode(required: ProficiencyCode, options: readonly ProficiencyCode[]): ProficiencyCode {
  const below = options.filter((p) => PROFICIENCY_RANK[p] < PROFICIENCY_RANK[required]);
  if (below.length === 0) return options[0];
  return below.reduce((best, p) => (PROFICIENCY_RANK[p] > PROFICIENCY_RANK[best] ? p : best));
}

function formatOccurrenceLabel(event: PmtEvent | undefined): string {
  if (!event) return "Not yet scheduled";
  const date = new Date(event.eventDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${event.title} · ${date}`;
}

export function QuickLogScreen({ cadets, catalog, completions, pmtEvents, createCompletion, updateCompletion, deleteCompletion, onSelectCadet }: Props) {
  const [cadetSearch, setCadetSearch] = useState("");
  const [objectiveSearch, setObjectiveSearch] = useState("");
  const [columnScope, setColumnScope] = useState<ColumnScope>("overdue");
  const [showAllCadets, setShowAllCadets] = useState(false);
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [levelFilter, setLevelFilter] = useState<DevLevel | "All">("All");
  const [pending, setPending] = useState<Record<string, string>>({}); // `${cadetId}:${objectiveId}` -> ProficiencyCode | NONE
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [explanationObjective, setExplanationObjective] = useState<TrainingObjective | undefined>();
  const [partialTarget, setPartialTarget] = useState<PartialDialogTarget | undefined>();

  // Loggable = has a proficiency code at ICL or SCL, whether or not the objective is graded.
  // Non-graded-but-leveled objectives are still columns here (available for optional logging);
  // they just never contribute to overdueByCadet below, so they only show by default once
  // "Show all objectives" is checked, never as part of the default overdue-only column set.
  const loggableObjectives = useMemo(() => catalog.filter((o) => o.proficiencyByLevel.ICL !== "" || o.proficiencyByLevel.SCL !== ""), [catalog]);

  const availableFlights = useMemo(() => FLIGHTS.filter((f) => cadets.some((c) => c.flight === f)), [cadets]);
  const availableLevels = useMemo(() => DEV_LEVELS.filter((l) => cadets.some((c) => c.devLevel === l)), [cadets]);

  const searchedCadets = useMemo(() => {
    const query = cadetSearch.trim().toLowerCase();
    return [...cadets]
      .filter((c) => query === "" || c.name.toLowerCase().includes(query))
      .filter((c) => flightFilter === "All" || c.flight === flightFilter)
      .filter((c) => levelFilter === "All" || c.devLevel === levelFilter)
      .sort((a, b) => compareByLastName(a.name, b.name));
  }, [cadets, cadetSearch, flightFilter, levelFilter]);

  const completionsByCadet = useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = map.get(c.cadetId) ?? [];
      list.push(c);
      map.set(c.cadetId, list);
    }
    return map;
  }, [completions]);

  /** Every PMT occurrence covering each objective, date-sorted -- the basis for both schedule status and column layout. */
  const occurrencesByObjective = useMemo(() => {
    const map = new Map<string, PmtEvent[]>();
    for (const objective of loggableObjectives) {
      map.set(
        objective.id,
        pmtEvents.filter((e) => e.objectiveIds.includes(objective.id)).sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      );
    }
    return map;
  }, [loggableObjectives, pmtEvents]);

  /** True when an objective's material is split across more than one PMT -- gets one gradeable column per occurrence instead of one column total. */
  const isMultiOccurrenceObjective = (objectiveId: string): boolean => (occurrencesByObjective.get(objectiveId)?.length ?? 0) > 1;

  /**
   * Schedule fact per objective, independent of any cadet or graded/optional status: does it still
   * have a future PMT that could cover it? "repeats" = at least one occurrence is still upcoming
   * (another chance later, whether or not one has already passed too). "lastChance" = it's had at
   * least one occurrence and every one of them is already in the past -- nothing left on the
   * calendar to cover it again. "none" = no PMT has ever covered it at all.
   */
  const scheduleStatusByObjective = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, "repeats" | "lastChance" | "none">();
    for (const objective of loggableObjectives) {
      const occurrences = occurrencesByObjective.get(objective.id) ?? [];
      if (occurrences.length === 0) {
        map.set(objective.id, "none");
      } else if (occurrences.some((e) => new Date(e.eventDate).getTime() > now)) {
        map.set(objective.id, "repeats");
      } else {
        map.set(objective.id, "lastChance");
      }
    }
    return map;
  }, [loggableObjectives, occurrencesByObjective]);

  /**
   * Per searched cadet: objective ids currently overdue (due/missed, graded only), and separately
   * every objective id (graded or optional) that's applicable at this cadet's level at all --
   * used below to scope "on the schedule" to objectives that actually apply to someone visible.
   */
  const columnEligibilityByCadet = useMemo(() => {
    const map = new Map<string, { overdue: Set<string>; applicable: Set<string> }>();
    for (const cadet of searchedCadets) {
      const overdue = new Set<string>();
      const applicable = new Set<string>();
      if (cadet.devLevel) {
        const cadetCompletions = completionsByCadet.get(cadet.id) ?? [];
        for (const objective of loggableObjectives) {
          if (objective.proficiencyByLevel[cadet.devLevel] === "") continue;
          applicable.add(objective.id);
          if (objective.graded) {
            const info = getObjectiveStatus(objective, cadet.devLevel, pmtEvents, cadetCompletions);
            if (isOverdue(info.status)) overdue.add(objective.id);
          }
        }
      }
      map.set(cadet.id, { overdue, applicable });
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

  /**
   * Objective ids -- graded or optional -- that are on the PMT schedule at all (past or future)
   * and applicable to at least one visible cadet's level. Every overdue objective is already a
   * subset of this (due/missed both require at least one occurrence), so this single set covers
   * the whole "overdue + still-relevant-to-the-schedule" middle scope on its own.
   */
  const scheduledObjectiveIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cadet of visibleCadets) {
      for (const id of columnEligibilityByCadet.get(cadet.id)?.applicable ?? []) {
        if (scheduleStatusByObjective.get(id) !== "none") ids.add(id);
      }
    }
    return ids;
  }, [visibleCadets, columnEligibilityByCadet, scheduleStatusByObjective]);

  const columns = useMemo(() => {
    const query = objectiveSearch.trim().toLowerCase();
    const qualifying = loggableObjectives
      .filter((o) => {
        if (columnScope === "all") return true;
        if (columnScope === "overdueAndScheduledOptional") return scheduledObjectiveIds.has(o.id);
        return overdueObjectiveIds.has(o.id);
      })
      .filter((o) => query === "" || o.number.toLowerCase().includes(query) || o.title.toLowerCase().includes(query))
      .sort((a, b) => a.ploOrder - b.ploOrder || compareObjectiveNumbers(a.number, b.number));

    const result: QuickLogColumn[] = [];
    for (const objective of qualifying) {
      const occurrences = occurrencesByObjective.get(objective.id) ?? [];
      if (occurrences.length > 1) {
        for (const occurrence of occurrences) {
          result.push({ key: `${objective.id}:${occurrence.id}`, objective, occurrence, isMultiOccurrence: true });
        }
      } else {
        result.push({ key: objective.id, objective, occurrence: occurrences[0], isMultiOccurrence: false });
      }
    }
    return result;
  }, [loggableObjectives, columnScope, overdueObjectiveIds, scheduledObjectiveIds, objectiveSearch, occurrencesByObjective]);

  const cellKey = (cadetId: string, objectiveId: string, pmtEventId: string | undefined) => `${cadetId}:${objectiveId}:${pmtEventId ?? ""}`;

  /** Single-occurrence objectives match by objectiveId alone (legacy completions may predate pmtEventId); multi-occurrence ones must match the specific occurrence too. */
  const getExistingCompletion = (cadetId: string, objectiveId: string, pmtEventId: string | undefined, isMultiOccurrence: boolean): Completion | undefined => {
    const list = completionsByCadet.get(cadetId) ?? [];
    if (isMultiOccurrence) return list.find((c) => c.objectiveId === objectiveId && c.pmtEventId === pmtEventId);
    return list.find((c) => c.objectiveId === objectiveId);
  };

  const getCellValue = (cadetId: string, objectiveId: string, pmtEventId: string | undefined, isMultiOccurrence: boolean): string => {
    const key = cellKey(cadetId, objectiveId, pmtEventId);
    if (key in pending) return pending[key];
    return getExistingCompletion(cadetId, objectiveId, pmtEventId, isMultiOccurrence)?.proficiencyAchieved ?? NONE;
  };

  const setCellValue = (cadetId: string, objectiveId: string, pmtEventId: string | undefined, isMultiOccurrence: boolean, value: string) => {
    const key = cellKey(cadetId, objectiveId, pmtEventId);
    const existing = getExistingCompletion(cadetId, objectiveId, pmtEventId, isMultiOccurrence);
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
        const [cadetId, objectiveId, pmtEventIdRaw] = key.split(":");
        const pmtEventId = pmtEventIdRaw === "" ? undefined : pmtEventIdRaw;
        const cadet = cadets.find((c) => c.id === cadetId);
        const objective = catalog.find((o) => o.id === objectiveId);
        if (!cadet || !objective) continue;
        const existing = getExistingCompletion(cadetId, objectiveId, pmtEventId, isMultiOccurrenceObjective(objectiveId));

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
          pmtEventId,
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
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <ListChecks className="h-5 w-5 text-primary" />
            Quick Log
          </h2>
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
        {availableFlights.length > 0 && (
          <Select value={flightFilter} onValueChange={(v) => setFlightFilter(v as Flight | "All")}>
            <SelectTrigger className="w-32">
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
        {availableLevels.length > 0 && (
          <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as DevLevel | "All")}>
            <SelectTrigger className="w-32">
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
            <SelectItem value="overdueAndScheduledOptional">Objectives: everything on the PMT schedule (overdue, upcoming, and optional)</SelectItem>
            <SelectItem value="all">Objectives: show all</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border border-input">
        <Table aria-label="Quick log grid">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-40 bg-background">Cadet</TableHead>
              {columns.map((col) => {
                const { objective, occurrence } = col;
                const schedule = scheduleStatusByObjective.get(objective.id) ?? "none";
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "min-w-36 border-t-4 pt-1.5 text-center align-bottom",
                      schedule === "lastChance"
                        ? "border-t-destructive bg-destructive/5"
                        : schedule === "repeats"
                          ? "border-t-success bg-success/5"
                          : "border-t-transparent"
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-center hover:underline"
                      title={`${objective.title} — click for the full requirements and pass criteria`}
                      onClick={() => setExplanationObjective(objective)}
                    >
                      <div className="text-xs font-medium">
                        {objective.number}
                        {!objective.graded && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
                      </div>
                      <div className="text-[11px] font-normal text-muted-foreground">{formatOccurrenceLabel(occurrence)}</div>
                    </button>
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
                {columns.map((col) => {
                  const { objective, occurrence, isMultiOccurrence } = col;
                  const schedule = scheduleStatusByObjective.get(objective.id) ?? "none";
                  const tint = schedule === "lastChance" ? "bg-destructive/5" : schedule === "repeats" ? "bg-success/5" : undefined;
                  const applicable = cadet.devLevel && objective.proficiencyByLevel[cadet.devLevel] !== "";
                  if (!applicable) {
                    return (
                      <TableCell key={col.key} className={cn("text-center text-xs text-muted-foreground", tint)}>
                        N/A
                      </TableCell>
                    );
                  }
                  const pmtEventId = occurrence?.id;
                  const key = cellKey(cadet.id, objective.id, pmtEventId);
                  const value = getCellValue(cadet.id, objective.id, pmtEventId, isMultiOccurrence);
                  const isDirty = key in pending;
                  const requiredCode = firstRequiredCode(objective.proficiencyByLevel[cadet.devLevel!]) ?? "P1";
                  const notPassOptions = PROFICIENCY_CODES.filter((p) => p !== requiredCode);
                  const isPass = value === requiredCode;
                  const isNotPass = value !== NONE && !isPass;
                  return (
                    <TableCell key={col.key} className={cn("p-1 text-center", tint)}>
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              "h-6 px-2 text-[11px]",
                              isPass && "border-success bg-success text-success-foreground hover:bg-success/90",
                              isDirty && "ring-2 ring-primary"
                            )}
                            onClick={() => setCellValue(cadet.id, objective.id, pmtEventId, isMultiOccurrence, isPass ? NONE : requiredCode)}
                          >
                            Pass
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={isNotPass ? "destructive" : "outline"}
                            className={cn("h-6 px-2 text-[11px]", isDirty && "ring-2 ring-primary")}
                            onClick={() =>
                              setCellValue(
                                cadet.id,
                                objective.id,
                                pmtEventId,
                                isMultiOccurrence,
                                isNotPass ? NONE : defaultNotPassCode(requiredCode, notPassOptions)
                              )
                            }
                          >
                            Not Pass
                          </Button>
                          {isMultiOccurrence && occurrence && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              title="Material for this Training Objective is split across several PMTs -- log partial progress at this specific session, optionally for several cadets at once."
                              onClick={() => setPartialTarget({ cadet, objective, occurrence, requiredCode })}
                            >
                              Partial
                            </Button>
                          )}
                        </div>
                        {isNotPass && (
                          <Select value={value} onValueChange={(v) => setCellValue(cadet.id, objective.id, pmtEventId, isMultiOccurrence, v)}>
                            <SelectTrigger className="h-6 w-full px-1.5 text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {notPassOptions.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
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

      {explanationObjective && (
        <ObjectiveExplanationDialog open onClose={() => setExplanationObjective(undefined)} objective={explanationObjective} />
      )}

      {partialTarget && (
        <CompletionEntryDialog
          open
          onClose={() => setPartialTarget(undefined)}
          cadet={partialTarget.cadet}
          cadets={cadets}
          objective={partialTarget.objective}
          requiredProficiency={partialTarget.requiredCode}
          pmtEventId={partialTarget.occurrence.id}
          existingCompletion={getExistingCompletion(partialTarget.cadet.id, partialTarget.objective.id, partialTarget.occurrence.id, true)}
          createCompletion={createCompletion}
          updateCompletion={updateCompletion}
          allowMultiplePartial
          findExistingCompletion={(cadetId) => getExistingCompletion(cadetId, partialTarget.objective.id, partialTarget.occurrence.id, true)}
        />
      )}
    </div>
  );
}
