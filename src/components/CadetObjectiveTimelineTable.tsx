import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getObjectiveStatus, isOverdue, completionForOccurrence, meetsRequirement } from "../domain/progress";
import { compareObjectiveNumbers } from "../domain/objectiveGrouping";
import { formatCadetName } from "../domain/nameUtils";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../domain/types";

interface Props {
  cadet: Cadet;
  objectives: TrainingObjective[];
  pmtEvents: PmtEvent[];
  cadetCompletions: Completion[];
  overdueOnly: boolean;
  onOpenObjective: (objective: TrainingObjective) => void;
}

type ColumnSort = "date" | "event";
type RowSort = "number" | "pmtDate";

/** Date-only (no time) comparison so a completion logged the same calendar day as a PMT still counts as "done at that session". */
function isOnOrAfterDay(completionDate: string, eventIso: string): boolean {
  return completionDate.slice(0, 10) >= eventIso.slice(0, 10);
}

export function CadetObjectiveTimelineTable({ cadet, objectives, pmtEvents, cadetCompletions, overdueOnly, onOpenObjective }: Props) {
  const [columnSort, setColumnSort] = useState<ColumnSort>("date");
  const [rowSort, setRowSort] = useState<RowSort>("number");

  const devLevel = cadet.devLevel;

  // Includes non-graded objectives that still carry a proficiency code at this level -- loggable,
  // just never required (filtered out of the overdueOnly view below since they're never overdue).
  const applicableObjectives = useMemo(
    () => (devLevel ? objectives.filter((o) => o.proficiencyByLevel[devLevel] !== "") : []),
    [objectives, devLevel]
  );

  const rows = useMemo(() => {
    if (!devLevel) return [];
    return applicableObjectives
      .map((objective) => {
        const info = getObjectiveStatus(objective, devLevel, pmtEvents, cadetCompletions);
        const firstOccurrenceDate = info.occurrences[0]?.eventDate;
        return { objective, info, firstOccurrenceDate };
      })
      .filter((r) => !overdueOnly || (r.objective.graded && isOverdue(r.info.status)));
  }, [applicableObjectives, devLevel, pmtEvents, cadetCompletions, overdueOnly]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    if (rowSort === "number") {
      copy.sort((a, b) => compareObjectiveNumbers(a.objective.number, b.objective.number) || a.objective.ploOrder - b.objective.ploOrder);
    } else {
      // pmtDate: earlier first-covering-PMT on top; objectives with no PMT ever go last.
      copy.sort((a, b) => {
        if (!a.firstOccurrenceDate && !b.firstOccurrenceDate) return 0;
        if (!a.firstOccurrenceDate) return 1;
        if (!b.firstOccurrenceDate) return -1;
        return a.firstOccurrenceDate.localeCompare(b.firstOccurrenceDate);
      });
    }
    return copy;
  }, [rows, rowSort]);

  const columns = useMemo(() => {
    const relevantIds = new Set(applicableObjectives.map((o) => o.id));
    const relevant = pmtEvents.filter((e) => e.objectiveIds.some((id) => relevantIds.has(id)));
    const copy = [...relevant];
    if (columnSort === "date") {
      copy.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    } else {
      copy.sort((a, b) => a.title.localeCompare(b.title));
    }
    return copy;
  }, [pmtEvents, applicableObjectives, columnSort]);

  if (!devLevel) {
    return <p className="text-sm text-muted-foreground">This cadet has no dev level set, so there's nothing to chart yet. Set it from the Roster screen.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table aria-label={`Objective x PMT timeline for ${formatCadetName(cadet)}`}>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 h-auto min-w-40 bg-background px-2 py-1">
              <div className="flex items-center gap-1">
                <span className="text-xs">Training Objective</span>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setRowSort(rowSort === "number" ? "pmtDate" : "number")}>
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
                <span className="text-[10px] font-normal text-muted-foreground">({rowSort === "number" ? "TO order" : "TO date"})</span>
              </div>
            </TableHead>
            {columns.map((event) => (
              <TableHead key={event.id} className="h-auto min-w-20 px-1 py-1 text-center">
                <div className="text-[10px] font-medium leading-tight">{event.title}</div>
                <div className="text-[9px] leading-tight text-muted-foreground">{new Date(event.eventDate).toLocaleDateString()}</div>
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="sticky left-0 z-10 h-auto bg-background px-2 py-0.5">
              <Button variant="ghost" size="sm" className="h-5 gap-1 text-[10px]" onClick={() => setColumnSort(columnSort === "date" ? "event" : "date")}>
                <ArrowUpDown className="h-3 w-3" />
                Columns: {columnSort === "date" ? "by date" : "by event"}
              </Button>
            </TableHead>
            {columns.map((event) => (
              <TableHead key={event.id} className="h-auto px-1 py-0.5" />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map(({ objective, info }) => {
            const requiredCode = objective.proficiencyByLevel[devLevel];
            return (
              <TableRow key={objective.id}>
                <TableCell className="sticky left-0 z-10 bg-background px-2 py-1">
                  <button className="text-left text-primary hover:underline" onClick={() => onOpenObjective(objective)}>
                    <span className="text-xs font-medium">{objective.number}</span> — <span className="text-[11px]">{objective.title}</span>
                  </button>
                  <div className="text-[10px] text-muted-foreground">
                    Required: {requiredCode}
                    {!objective.graded && " (optional, never overdue)"}
                  </div>
                </TableCell>
                {columns.map((event) => {
                  const covers = event.objectiveIds.includes(objective.id);
                  if (!covers) {
                    return (
                      <TableCell key={event.id} className="px-1 py-0.5 text-center text-[10px] text-muted-foreground">
                        —
                      </TableCell>
                    );
                  }
                  // Multi-occurrence objectives are graded independently per PMT -- match this
                  // column's own completion rather than any occurrence's, so a pass logged at one
                  // session doesn't paint a checkmark onto a different session's column.
                  const isMultiOccurrence = info.occurrences.length > 1;
                  const columnCompletion = isMultiOccurrence ? completionForOccurrence(objective.id, event.id, cadetCompletions) : info.bestCompletion;
                  const hasEntry = columnCompletion && isOnOrAfterDay(columnCompletion.dateCompleted ?? "", event.eventDate);
                  // A Partial entry shows up (so cadre can see something was logged) but never counts
                  // as satisfying this occurrence -- matches getObjectiveStatus/meetsRequirement.
                  const satisfied = isMultiOccurrence ? meetsRequirement(columnCompletion, requiredCode) : hasEntry;
                  const isPast = new Date(event.eventDate).getTime() <= Date.now();
                  // Non-graded objectives are loggable but never read as overdue/missed, regardless of schedule.
                  const optional = !objective.graded;
                  const columnMissed = isMultiOccurrence ? isPast && !satisfied : info.status === "missed";
                  const notCovered = hasEntry && columnCompletion?.notCovered;
                  return (
                    <TableCell key={event.id} className="px-1 py-0.5 text-center">
                      <button
                        className={cn(
                          "w-full rounded px-1 py-0.5 text-[10px] leading-tight",
                          notCovered
                            ? "text-muted-foreground italic"
                            : hasEntry
                              ? satisfied
                                ? "bg-success/15 text-success"
                                : "bg-warning/15 text-warning-foreground"
                              : optional || !isPast
                                ? "text-muted-foreground"
                                : columnMissed
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-warning/15 text-warning-foreground"
                        )}
                        onClick={() => onOpenObjective(objective)}
                      >
                        {notCovered
                          ? "Not Covered"
                          : hasEntry
                            ? `✓ ${columnCompletion?.proficiencyAchieved}${!satisfied ? " (Partial)" : ""}`
                            : optional
                              ? "Optional"
                              : !isPast
                                ? "Upcoming"
                                : columnMissed
                                  ? "Missed"
                                  : "Due"}
                      </button>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {sortedRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground">
                {overdueOnly ? "No overdue Training Objectives for this cadet." : "No applicable Training Objectives at this dev level."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
