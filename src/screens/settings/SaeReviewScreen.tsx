import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { isEntryOutsideWindow } from "../../domain/attendance";
import { ungradedTrainingWeeks } from "../../domain/toReportingDeadline";
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

interface LateEvent {
  event: PmtEvent;
  entries: LateEntry[];
}

/**
 * SAE-only (SOP 1 Oct 2026, Sections 3 and 4) -- surfaces two compliance flags that previously had
 * no review surface at all: PMT accountability recorded after its own 2000-same-day window
 * (Section 3), and Training Weeks whose Friday-2000 TO recording deadline has passed with objectives
 * still ungraded (Section 4). Purely informational -- nothing here blocks or auto-corrects anything,
 * it just gives the SAE a durable place to go check.
 */
export function SaeReviewScreen({ roster, events, attendance, catalog, completions }: Props) {
  const rosterById = useMemo(() => new Map(roster.map((c) => [c.id, c])), [roster]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const lateEvents = useMemo<LateEvent[]>(() => {
    const byEvent = new Map<string, LateEntry[]>();
    for (const record of attendance) {
      const event = eventsById.get(record.pmtEventId);
      if (!event || !isEntryOutsideWindow(event, record.recordedAt)) continue;
      const cadet = rosterById.get(record.cadetId);
      const list = byEvent.get(event.id) ?? [];
      list.push({ cadetName: cadet ? formatCadetName(cadet) : "Unknown cadet", recordedAt: record.recordedAt });
      byEvent.set(event.id, list);
    }
    return [...byEvent.entries()]
      .map(([eventId, entries]) => ({ event: eventsById.get(eventId)!, entries: entries.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)) }))
      .sort((a, b) => b.event.eventDate.localeCompare(a.event.eventDate));
  }, [attendance, eventsById, rosterById]);

  const ungradedWeeks = useMemo(() => ungradedTrainingWeeks(events, catalog, roster, completions), [events, catalog, roster, completions]);

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold">
        <ShieldAlert className="h-5 w-5 text-primary" />
        SAE Review
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Compliance flags from the Det 756 HUB SOP (1 Oct 2026) -- late-recorded accountability (Section 3) and Training Objectives not graded by their
        weekly deadline (Section 4). Informational only; nothing here is auto-corrected.
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Accountability recorded after 2000
              {lateEvents.length > 0 && (
                <Badge variant="destructive" className="ml-1.5">
                  {lateEvents.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>PMTs where at least one entry was recorded after the normal same-day window closed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {lateEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing flagged.</p>
            ) : (
              lateEvents.map(({ event, entries }) => (
                <div key={event.id} className="rounded-md border border-input p-3">
                  <div className="text-sm font-medium">
                    {event.title} — {new Date(event.eventDate).toLocaleDateString()} ({event.eventType})
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {entries.map((e, i) => (
                      <li key={i}>
                        {e.cadetName} — recorded {new Date(e.recordedAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Training Objectives past the Friday deadline
              {ungradedWeeks.length > 0 && (
                <Badge variant="destructive" className="ml-1.5">
                  {ungradedWeeks.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Training Weeks whose Friday-2000 deadline has passed with at least one covered objective still ungraded.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {ungradedWeeks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing flagged.</p>
            ) : (
              ungradedWeeks.map((week) => (
                <div key={week.trainingWeek} className="rounded-md border border-input p-3">
                  <div className="text-sm font-medium">
                    Training Week {week.trainingWeek} — deadline was {week.deadline.toLocaleString()}
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {week.outstanding.map((o, i) => (
                      <li key={i}>
                        {o.objective.number} {o.objective.title} — {o.event.title} ({new Date(o.event.eventDate).toLocaleDateString()})
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
