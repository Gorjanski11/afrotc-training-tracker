import { useMemo } from "react";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LayoutDashboard, FileText, ClipboardList, TriangleAlert, Clock, UserX, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { absenceMemoDeadline } from "../../domain/constants";
import type { AbsenceMemo, DeviationMemo, PmtEvent, Cadet } from "../../domain/types";
import type { AttendanceRecordRef } from "../../hooks/useAttendanceRecords";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: AttendanceRecordRef[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
}

function HeroStat({ icon, label, value, tone, index }: { icon: React.ReactNode; label: string; value: string; tone?: "critical"; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.05 }}>
      <Card className="hover:shadow-md">
        <CardContent className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              tone === "critical" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            )}
          >
            {icon}
          </span>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className={cn("text-2xl font-semibold tabular-nums", tone === "critical" && "text-destructive")}>{value}</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Absence Memo tracking only starts here -- everything before this was recorded on a different
// platform before this site existed, so it's excluded from the "no memo filed" flag entirely.
const ABSENCE_MEMO_TRACKING_START = "2026-09-21";

export function DashboardScreen({ roster, events, attendance, absenceMemos, deviationMemos }: Props) {
  const pendingAbsence = useMemo(() => absenceMemos.filter((m) => m.status === "Pending"), [absenceMemos]);
  const awaitingSubmission = useMemo(() => deviationMemos.filter((m) => m.status === "Assigned"), [deviationMemos]);
  const overdueDeviations = useMemo(
    () => awaitingSubmission.filter((m) => m.dueDate && new Date(m.dueDate).getTime() < Date.now()),
    [awaitingSubmission]
  );
  const awaitingReview = useMemo(() => deviationMemos.filter((m) => m.status === "Submitted"), [deviationMemos]);

  // Cadets who haven't submitted their auto-assigned Absence Memo within 72 hours of the PMT's own
  // end time -- distinct from "Absent, no memo filed" below, which has no time limit and also
  // predates this auto-assignment flow entirely.
  const overdueAbsence = useMemo(() => {
    const eventsById = new Map(events.map((e) => [e.id, e]));
    const now = Date.now();
    return absenceMemos
      .filter((m) => m.status === "Assigned")
      .map((m) => ({ memo: m, event: eventsById.get(m.pmtEventIds[0]) }))
      .filter((row): row is { memo: AbsenceMemo; event: PmtEvent } => !!row.event && absenceMemoDeadline(row.event.eventDate, row.event.eventType).getTime() < now);
  }, [absenceMemos, events]);

  // Visual flag only (explicit project decision) -- absent on Accountability's shared attendance
  // collection but no Absence Memo (any status) yet references that same cadet+PMT. Nothing is
  // ever auto-created here; this is purely a reminder for cadre that a memo is owed.
  const absentNoMemo = useMemo(() => {
    const covered = new Set(absenceMemos.flatMap((m) => m.pmtEventIds.map((pmtEventId) => `${m.cadetId}__${pmtEventId}`)));
    const rosterById = new Map(roster.map((p) => [p.id, p]));
    const eventsById = new Map(events.map((e) => [e.id, e]));
    return attendance
      .filter((a) => a.status === "A" && !covered.has(`${a.cadetId}__${a.pmtEventId}`))
      .map((a) => ({ record: a, cadet: rosterById.get(a.cadetId), event: eventsById.get(a.pmtEventId) }))
      .filter((row) => row.cadet && row.event && row.event.eventDate >= ABSENCE_MEMO_TRACKING_START)
      .sort((a, b) => (b.event!.eventDate ?? "").localeCompare(a.event!.eventDate ?? ""));
  }, [attendance, absenceMemos, roster, events]);

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        Dashboard
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <HeroStat
          icon={<FileText className="h-4.5 w-4.5" />}
          label="Absence Memos Pending For Review"
          value={String(pendingAbsence.length)}
          tone={pendingAbsence.length > 0 ? "critical" : undefined}
          index={0}
        />
        <HeroStat
          icon={<CalendarClock className="h-4.5 w-4.5" />}
          label="Overdue Absence Memos"
          value={String(overdueAbsence.length)}
          tone={overdueAbsence.length > 0 ? "critical" : undefined}
          index={1}
        />
        <HeroStat
          icon={<Clock className="h-4.5 w-4.5" />}
          label="Deviations awaiting submission"
          value={String(awaitingSubmission.length)}
          index={2}
        />
        <HeroStat
          icon={<TriangleAlert className="h-4.5 w-4.5" />}
          label="Deviations overdue"
          value={String(overdueDeviations.length)}
          tone={overdueDeviations.length > 0 ? "critical" : undefined}
          index={3}
        />
        <HeroStat
          icon={<ClipboardList className="h-4.5 w-4.5" />}
          label="Pending Deviation Memos for Review"
          value={String(awaitingReview.length)}
          tone={awaitingReview.length > 0 ? "critical" : undefined}
          index={4}
        />
        <HeroStat
          icon={<UserX className="h-4.5 w-4.5" />}
          label="Absent, no memo filed"
          value={String(absentNoMemo.length)}
          tone={absentNoMemo.length > 0 ? "critical" : undefined}
          index={5}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <FileText className="h-4 w-4 text-primary" />
              Pending Absence Memos For Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingAbsence.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            ) : (
              <div className="space-y-1.5">
                {pendingAbsence.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span>{m.cadetName}</span>
                    <span className="text-muted-foreground">{new Date(m.submittedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <CalendarClock className="h-4 w-4 text-destructive" />
              Overdue Absence Memos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdueAbsence.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing overdue -- everyone's within their 72-hour window.</p>
            ) : (
              <div className="space-y-1.5">
                {overdueAbsence.map(({ memo, event }) => (
                  <div key={memo.id} className="flex items-center justify-between text-sm">
                    <span>{memo.cadetName}</span>
                    <span className="text-muted-foreground">
                      {event.eventType} — {event.title} ({new Date(event.eventDate).toLocaleDateString()})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <TriangleAlert className="h-4 w-4 text-destructive" />
              Overdue Deviation Memos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdueDeviations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing overdue.</p>
            ) : (
              <div className="space-y-1.5">
                {overdueDeviations.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span>{m.cadetName}</span>
                    <span className="text-muted-foreground">Due {new Date(m.dueDate!).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              <UserX className="h-4 w-4 text-destructive" />
              Absent, no Absence Memo filed yet
            </CardTitle>
          </CardHeader>
          <CardContent>
            {absentNoMemo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding -- every Absent record on Accountability has a memo covering it.</p>
            ) : (
              <div className="space-y-1.5">
                {absentNoMemo.map(({ record, cadet, event }) => (
                  <div key={record.id} className="flex items-center justify-between text-sm">
                    <span>{cadet!.name}</span>
                    <span className="text-muted-foreground">
                      {event!.eventType} — {event!.title} ({new Date(event!.eventDate).toLocaleDateString()})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
