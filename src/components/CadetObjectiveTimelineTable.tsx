import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getObjectiveStatus, isOverdue, completionForOccurrence } from "../domain/progress";
import { compareObjectiveNumbers } from "../domain/objectiveGrouping";
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
      <Table aria-label={`Objective x PMT timeline for ${cadet.name}`}>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 min-w-56 bg-background">
              <div className="flex items-center gap-2">
                <span>Training Objective</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRowSort(rowSort === "number" ? "pmtDate" : "number")}>
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
                <span className="text-xs font-normal text-muted-foreground">({rowSort === "number" ? "TO order" : "TO date"})</span>
              </div>
            </TableHead>
            {columns.map((event) => (
              <TableHead key={event.id} className="min-w-32 text-center">
                <div className="text-xs font-medium">{event.title}</div>
                <div className="text-xs text-muted-foreground">{new Date(event.eventDate).toLocaleDateString()}</div>
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background">
              <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => setColumnSort(columnSort === "date" ? "event" : "date")}>
                <ArrowUpDown className="h-3 w-3" />
                Columns: {columnSort === "date" ? "by date" : "by event"}
              </Button>
            </TableHead>
            {columns.map((event) => (
              <TableHead key={event.id} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map(({ objective, info }) => {
            const requiredCode = objective.proficiencyByLevel[devLevel];
            return (
              <TableRow key={objective.id}>
                <TableCell className="sticky left-0 z-10 bg-background">
                  <button className="text-left text-primary hover:underline" onClick={() => onOpenObjective(objective)}>
                    <span className="font-medium">{objective.number}</span> — <span className="text-xs">{objective.title}</span>
                  </button>
                  <div className="text-xs text-muted-foreground">
                    Required: {requiredCode}
                    {!objective.graded && " (optional, never overdue)"}
                  </div>
                </TableCell>
                {columns.map((event) => {
                  const covers = event.objectiveIds.includes(objective.id);
                  if (!covers) {
                    return (
                      <TableCell key={event.id} className="text-center text-muted-foreground">
                        —
                      </TableCell>
                    );
                  }
                  // Multi-occurrence objectives are graded independently per PMT -- match this
                  // column's own completion rather than any occurrence's, so a pass logged at one
                  // session doesn't paint a checkmark onto a different session's column.
                  const isMultiOccurrence = info.occurrences.length > 1;
                  const columnCompletion = isMultiOccurrence ? completionForOccurrence(objective.id, event.id, cadetCompletions) : info.bestCompletion;
                  const done = columnCompletion && isOnOrAfterDay(columnCompletion.dateCompleted ?? "", event.eventDate);
                  const isPast = new Date(event.eventDate).getTime() <= Date.now();
                  // Non-graded objectives are loggable but never read as overdue/missed, regardless of schedule.
                  const optional = !objective.graded;
                  const columnMissed = isMultiOccurrence ? isPast && !done : info.status === "missed";
                  return (
                    <TableCell key={event.id} className="text-center">
                      <button
                        className={cn(
                          "w-full rounded px-1.5 py-0.5 text-xs",
                          done
                            ? columnCompletion?.partial
                              ? "bg-warning/15 text-warning-foreground"
                              : "bg-success/15 text-success"
                            : optional || !isPast
                              ? "text-muted-foreground"
                              : columnMissed
                                ? "bg-destructive/15 text-destructive"
                                : "bg-warning/15 text-warning-foreground"
                        )}
                        onClick={() => onOpenObjective(objective)}
                      >
                        {done
                          ? `✓ ${columnCompletion?.proficiencyAchieved}${columnCompletion?.partial ? " (Partial)" : ""}`
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
