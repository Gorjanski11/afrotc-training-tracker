import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { isEntryOutsideWindow } from "../../domain/attendance";
import { accountabilityFlags, toFlags, type AccountabilityFlag, type ToFlag } from "../../domain/saeReviewDeadlines";
import { formatCadetName } from "../../domain/nameUtils";
import type { Attendance, Cadet, Completion, PmtEvent, TrainingObjective } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  catalog: TrainingObjective[];
  completions: Completion[];
}

interface LateEntry {
  cadetName: string;
  recordedAt: string;
}

function StatusBadge({ status }: { status: "late" | "missing" }) {
  return status === "missing" ? <Badge variant="destructive">Missing</Badge> : <Badge variant="warning">Late</Badge>;
}

/**
 * SAE-only (SOP 1 Oct 2026, Sections 3 and 4), organized by Training Week. Three compliance flags:
 * - Accountability not yet submitted past its 2000-same-day deadline, per Group/Flight, with the
 *   responsible commander and whether it's Late (within the 2hr grace window) or Missing (past it).
 * - Training Objectives not yet graded past their Friday-2000 deadline, per Group/Flight (GMC) or
 *   the SAE himself (POC), same Late/Missing distinction.
 * - Accountability that WAS eventually submitted, but after the 2000 window (informational --
 *   already resolved, just flagged for awareness).
 * Purely informational -- nothing here blocks or auto-corrects anything.
 */
export function SaeReviewScreen({ roster, events, attendance, catalog, completions }: Props) {
  const rosterById = useMemo(() => new Map(roster.map((c) => [c.id, c])), [roster]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const nameFor = (email: string): string => {
    const match = roster.find((c) => c.email?.trim().toLowerCase() === email.trim().toLowerCase());
    return match ? formatCadetName(match) : email;
  };

  const acctFlags = useMemo(() => accountabilityFlags(events, roster, attendance), [events, roster, attendance]);
  const toFlagList = useMemo(() => toFlags(events, catalog, roster, completions), [events, catalog, roster, completions]);

  const lateRecordedEntries = useMemo(() => {
    const byEvent = new Map<string, LateEntry[]>();
    for (const record of attendance) {
      const event = eventsById.get(record.pmtEventId);
      if (!event || !isEntryOutsideWindow(event, record.recordedAt)) continue;
      const cadet = rosterById.get(record.cadetId);
      const list = byEvent.get(event.id) ?? [];
      list.push({ cadetName: cadet ? formatCadetName(cadet) : "Unknown cadet", recordedAt: record.recordedAt });
      byEvent.set(event.id, list);
    }
    return byEvent;
  }, [attendance, eventsById, rosterById]);

  // Union of every TW that has at least one of the three kinds of flags, newest first.
  const weekNumbers = useMemo(() => {
    const weeks = new Set<number>();
    for (const f of acctFlags) if (f.event.trainingWeek !== undefined) weeks.add(f.event.trainingWeek);
    for (const f of toFlagList) weeks.add(f.trainingWeek);
    for (const [eventId] of lateRecordedEntries) {
      const tw = eventsById.get(eventId)?.trainingWeek;
      if (tw !== undefined) weeks.add(tw);
    }
    return [...weeks].sort((a, b) => b - a);
  }, [acctFlags, toFlagList, lateRecordedEntries, eventsById]);

  const totalFlags = acctFlags.length + toFlagList.length;

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold">
        <ShieldAlert className="h-5 w-5 text-primary" />
        SAE Review
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Compliance flags from the Det 756 HUB SOP (1 Oct 2026), organized by Training Week -- Accountability (Section 3) and Training Objectives
        (Section 4) not yet submitted/graded past their deadline, who's responsible, and whether it's Late (within the 2-hour grace window) or Missing
        (past it). Informational only; nothing here is auto-corrected.
      </p>

      {weekNumbers.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">Nothing flagged.</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {weekNumbers.map((tw) => {
            const acctForWeek = acctFlags.filter((f) => f.event.trainingWeek === tw);
            const toForWeek = toFlagList.filter((f) => f.trainingWeek === tw);
            const lateRecordedForWeek = [...lateRecordedEntries.entries()].filter(([eventId]) => eventsById.get(eventId)?.trainingWeek === tw);

            return (
              <Card key={tw}>
                <CardHeader>
                  <CardTitle>
                    Training Week {tw}
                    {acctForWeek.length + toForWeek.length > 0 && (
                      <Badge variant="destructive" className="ml-1.5">
                        {acctForWeek.length + toForWeek.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {acctForWeek.length > 0 && (
                    <div>
                      <CardDescription className="mb-1.5">Accountability not yet submitted</CardDescription>
                      <div className="space-y-1.5">
                        {acctForWeek.map((f, i) => (
                          <AccountabilityRow key={i} flag={f} responsibleName={nameFor(f.responsibleEmail)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {toForWeek.length > 0 && (
                    <div>
                      <CardDescription className="mb-1.5">Training Objectives not yet graded</CardDescription>
                      <div className="space-y-1.5">
                        {toForWeek.map((f, i) => (
                          <ToRow key={i} flag={f} responsibleName={nameFor(f.responsibleEmail)} />
                        ))}
                      </div>
                    </div>
                  )}
                  {lateRecordedForWeek.length > 0 && (
                    <div>
                      <CardDescription className="mb-1.5">Accountability recorded after 2000 (already submitted)</CardDescription>
                      <div className="space-y-2">
                        {lateRecordedForWeek.map(([eventId, entries]) => {
                          const event = eventsById.get(eventId)!;
                          return (
                            <div key={eventId} className="rounded-md border border-input p-2.5 text-xs">
                              <div className="font-medium">
                                {event.title} — {new Date(event.eventDate).toLocaleDateString()} ({event.eventType})
                              </div>
                              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                {entries.map((e, i) => (
                                  <li key={i}>
                                    {e.cadetName} — recorded {new Date(e.recordedAt).toLocaleString()}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {totalFlags === 0 && weekNumbers.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Only already-resolved late entries remain -- nothing currently outstanding.</p>
      )}
    </div>
  );
}

function AccountabilityRow({ flag, responsibleName }: { flag: AccountabilityFlag; responsibleName: string }) {
  const unitLabel = flag.unitKind === "group" ? `${flag.unitValue} Group` : `${flag.unitValue} Flight`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input p-2.5 text-xs">
      <div>
        <span className="font-medium">
          {flag.event.title} — {new Date(flag.event.eventDate).toLocaleDateString()} ({flag.event.eventType})
        </span>
        <div className="text-muted-foreground">
          {unitLabel}: {flag.missing}/{flag.total} cadets missing — responsible: {responsibleName}
        </div>
      </div>
      <StatusBadge status={flag.status} />
    </div>
  );
}

function ToRow({ flag, responsibleName }: { flag: ToFlag; responsibleName: string }) {
  const unitLabel = flag.cohort === "GMC" ? `${flag.unitValue} Flight` : "POC";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input p-2.5 text-xs">
      <div>
        <span className="font-medium">
          {flag.objective.number} {flag.objective.title}
        </span>
        <div className="text-muted-foreground">
          {flag.event.title} ({new Date(flag.event.eventDate).toLocaleDateString()}) — {unitLabel}, responsible: {responsibleName}
        </div>
      </div>
      <StatusBadge status={flag.status} />
    </div>
  );
}
