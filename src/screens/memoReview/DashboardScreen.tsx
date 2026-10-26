import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText, ClipboardList, TriangleAlert, Clock, CalendarClock, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { effectiveAbsenceMemoDeadline } from "../../domain/constants";
import { shortDate, isReturnedOverdue } from "../../domain/memoAnalytics";
import { visibleAbsenceMemos, visibleDeviationMemos } from "../../domain/access";
import { LiquidToggle } from "../../components/analytics/LiquidToggle";
import type { AbsenceMemo, Cadet, DeviationMemo, PermissionsConfig, PmtEvent } from "../../domain/types";

interface Props {
  events: PmtEvent[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
  roster: Cadet[];
  userEmail: string | null | undefined;
  permissionsConfig: PermissionsConfig;
  /** Jumps to the Absence Memos screen with this specific memo's review popup opened -- undefined when the viewer can't see Absence Memos at all. */
  onOpenAbsence?: (memoId: string) => void;
  /** Jumps to the Deviation Memos screen with this specific memo's review popup opened. */
  onOpenDeviation: (memoId: string) => void;
}

type ReturnedKind = "Absence" | "Deviation";

/** A single pending/overdue list card -- shared shape across all three dashboard columns. */
function MemoListCard({
  icon,
  title,
  tone,
  rows,
  emptyLabel,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "critical";
  rows: { key: string; left: string; right: string; onClick?: () => void }[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn(tone === "critical" && "text-destructive")}>
          {icon}
          {title}
          {rows.length > 0 && <span className="ml-auto text-sm font-normal text-muted-foreground">{rows.length}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((row) =>
              row.onClick ? (
                <button
                  key={row.key}
                  type="button"
                  onClick={row.onClick}
                  className="flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left text-sm hover:bg-accent"
                >
                  <span>{row.left}</span>
                  <span className="text-muted-foreground">{row.right}</span>
                </button>
              ) : (
                <div key={row.key} className="flex items-center justify-between text-sm">
                  <span>{row.left}</span>
                  <span className="text-muted-foreground">{row.right}</span>
                </div>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Section 2 -- same "concerning this viewer" scoping as the Absence/Deviation Memos screens and
 * Memorandums Analytics, so every count on this landing page agrees with what's actually in the
 * lists behind it. Three columns: Absence (Pending/Overdue-to-submit), Deviation
 * (Pending-review/Overdue-to-submit), and Returned (Pending/Overdue-to-resubmit) -- the third
 * toggles between Absence and Deviation on its own, independent of the first two, defaulting to
 * Absence.
 */
export function DashboardScreen({ events, absenceMemos, deviationMemos, roster, userEmail, permissionsConfig, onOpenAbsence, onOpenDeviation }: Props) {
  const myAbsenceMemos = useMemo(() => visibleAbsenceMemos(userEmail, roster, absenceMemos, permissionsConfig), [absenceMemos, roster, userEmail, permissionsConfig]);
  const myDeviationMemos = useMemo(() => visibleDeviationMemos(userEmail, roster, deviationMemos), [deviationMemos, roster, userEmail]);

  const pendingAbsence = useMemo(() => myAbsenceMemos.filter((m) => m.status === "Pending"), [myAbsenceMemos]);
  const awaitingSubmission = useMemo(() => myDeviationMemos.filter((m) => m.status === "Assigned"), [myDeviationMemos]);
  const overdueDeviations = useMemo(
    () => awaitingSubmission.filter((m) => m.dueDate && new Date(m.dueDate).getTime() < Date.now()),
    [awaitingSubmission]
  );
  const awaitingReview = useMemo(() => myDeviationMemos.filter((m) => m.status === "Submitted"), [myDeviationMemos]);

  // Cadets who haven't submitted their auto-assigned Absence Memo within 72 hours of the PMT's own
  // end time -- distinct from "Absent, no memo filed" below, which has no time limit and also
  // predates this auto-assignment flow entirely.
  const overdueAbsence = useMemo(() => {
    const eventsById = new Map(events.map((e) => [e.id, e]));
    const now = Date.now();
    return myAbsenceMemos
      .filter((m) => m.status === "Assigned")
      .map((m) => ({ memo: m, event: eventsById.get(m.pmtEventIds[0]) }))
      .filter(
        (row): row is { memo: AbsenceMemo; event: PmtEvent } =>
          !!row.event && effectiveAbsenceMemoDeadline(row.event.eventDate, row.event.eventType, row.memo.deadlineOverrideAt).getTime() < now
      );
  }, [myAbsenceMemos, events]);

  // -- Column 3: Returned -- toggles independently between Absence and Deviation, default Absence.
  const [returnedKind, setReturnedKind] = useState<ReturnedKind>("Absence");
  const returnedAbsence = useMemo(() => myAbsenceMemos.filter((m) => m.status === "Returned"), [myAbsenceMemos]);
  const returnedDeviation = useMemo(() => myDeviationMemos.filter((m) => m.status === "Returned"), [myDeviationMemos]);
  const returnedForKind = returnedKind === "Absence" ? returnedAbsence : returnedDeviation;
  const pendingReturned = useMemo(() => returnedForKind.filter((m) => !isReturnedOverdue(m.reviewedAt)), [returnedForKind]);
  const overdueReturned = useMemo(() => returnedForKind.filter((m) => isReturnedOverdue(m.reviewedAt)), [returnedForKind]);
  const openReturned = returnedKind === "Absence" ? onOpenAbsence : onOpenDeviation;

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">Dashboard</h2>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Column 1: Absence */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Absence Memos</h3>
          <MemoListCard
            icon={<FileText className="h-4 w-4 text-primary" />}
            title="Pending For Review"
            tone={pendingAbsence.length > 0 ? "critical" : undefined}
            rows={pendingAbsence.map((m) => ({
              key: m.id,
              left: m.cadetName,
              right: shortDate(m.submittedAt),
              onClick: onOpenAbsence ? () => onOpenAbsence(m.id) : undefined,
            }))}
            emptyLabel="Nothing pending."
          />
          <MemoListCard
            icon={<CalendarClock className="h-4 w-4 text-destructive" />}
            title="Overdue"
            tone={overdueAbsence.length > 0 ? "critical" : undefined}
            rows={overdueAbsence.map(({ memo, event }) => ({
              key: memo.id,
              left: memo.cadetName,
              right: `${event.eventType} — ${event.title} (${shortDate(event.eventDate)})`,
            }))}
            emptyLabel="Nothing overdue -- everyone's within their 72-hour window."
          />
        </div>

        {/* Column 2: Deviation */}
        <div className="flex flex-col gap-4">
          <h3 className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
            <span>Deviation Memos</span>
            <span className="font-normal">Awaiting submission: {awaitingSubmission.length}</span>
          </h3>
          <MemoListCard
            icon={<ClipboardList className="h-4 w-4 text-primary" />}
            title="Pending For Review"
            tone={awaitingReview.length > 0 ? "critical" : undefined}
            rows={awaitingReview.map((m) => ({ key: m.id, left: m.cadetName, right: shortDate(m.submittedAt), onClick: () => onOpenDeviation(m.id) }))}
            emptyLabel="Nothing pending."
          />
          <MemoListCard
            icon={<TriangleAlert className="h-4 w-4 text-destructive" />}
            title="Overdue"
            tone={overdueDeviations.length > 0 ? "critical" : undefined}
            rows={overdueDeviations.map((m) => ({ key: m.id, left: m.cadetName, right: `Due ${shortDate(m.dueDate)}` }))}
            emptyLabel="Nothing overdue."
          />
        </div>

        {/* Column 3: Returned -- its own Absence/Deviation toggle, independent of columns 1-2. */}
        <div className="flex flex-col gap-4">
          <h3 className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
            <span>Returned</span>
            <LiquidToggle
              layoutId="returned-kind-toggle"
              options={[
                { value: "Absence", label: "ABS" },
                { value: "Deviation", label: "DEV" },
              ]}
              value={returnedKind}
              onChange={(v) => setReturnedKind(v as ReturnedKind)}
            />
          </h3>
          <MemoListCard
            icon={<Undo2 className="h-4 w-4 text-primary" />}
            title="Pending Resubmission"
            rows={pendingReturned.map((m) => ({
              key: m.id,
              left: m.cadetName,
              right: `Returned ${shortDate(m.reviewedAt)}`,
              onClick: openReturned ? () => openReturned(m.id) : undefined,
            }))}
            emptyLabel="Nothing pending."
          />
          <MemoListCard
            icon={<Clock className="h-4 w-4 text-destructive" />}
            title="Overdue Resubmission"
            tone={overdueReturned.length > 0 ? "critical" : undefined}
            rows={overdueReturned.map((m) => ({
              key: m.id,
              left: m.cadetName,
              right: `Returned ${shortDate(m.reviewedAt)}`,
              onClick: openReturned ? () => openReturned(m.id) : undefined,
            }))}
            emptyLabel="Nothing overdue -- everyone's within their 48-hour resubmit window."
          />
        </div>
      </div>
    </div>
  );
}
