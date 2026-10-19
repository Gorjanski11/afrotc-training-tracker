import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Gauge, CalendarDays, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { bucketForEventType, PLO_SHORT_CODE, type PloSection } from "../../domain/constants";
import { computeCadetAttendanceSummary, absencesRemainingForGoodStanding, type BucketTally } from "../../domain/attendance";
import { memoStatusVariant, shortDate, shortDateTimeBracketed } from "../../domain/memoAnalytics";
import { PdfLinkButton } from "../../components/PdfLinkButton";
import { isCortesGaray } from "../../domain/access";
import { formatCadetNameCompact } from "../../domain/nameUtils";
import { accountabilityFlags, toFlags, type AccountabilityFlag, type ToFlag } from "../../domain/saeReviewDeadlines";
import { Stepper } from "../../components/analytics/Stepper";
import { WeekView } from "../../components/WeekView";
import { StatusDot, StandingBadge } from "../analytics/AccountabilityAnalyticsView";
import type { AbsenceMemo, Attendance, Cadet, Completion, DeviationMemo, PmtEvent, TrainingObjective } from "../../domain/types";

interface Props {
  cadet: Cadet;
  events: PmtEvent[];
  attendance: Attendance[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
  /** Only needed to compute the SAE Review glance, shown only when `cadet` is Cortes Garay -- every
   * other viewer's dashboard ignores these entirely, so callers can pass the full roster/catalog. */
  fullRoster?: Cadet[];
  catalog?: TrainingObjective[];
  completions?: Completion[];
  onOpenSaeReview?: () => void;
  /** Jumps to Memo Submission's Absence or Deviation tab -- set by the "Missing Memos" tile below when it's clickable (i.e. there's actually something missing). */
  onOpenMissingMemos?: (screen: "absence" | "deviation") => void;
}

const TONE_CLASSES: Record<"success" | "warning" | "critical", { badge: string; value: string }> = {
  success: { badge: "bg-success/10 text-success", value: "text-success" },
  warning: { badge: "bg-warning/10 text-warning-foreground", value: "text-warning-foreground" },
  critical: { badge: "bg-destructive/10 text-destructive", value: "text-destructive" },
};

/** Condensed top-row stat box -- colored by `tone` (Good/Warning/Hard Limit-style severity), not just a plain critical/neutral split. */
function HeroStat({
  icon,
  label,
  value,
  detail,
  tone,
  index,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: "success" | "warning" | "critical";
  index: number;
  onClick?: () => void;
}) {
  const toneClasses = tone ? TONE_CLASSES[tone] : undefined;
  return (
    <motion.div className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.05 }}>
      <Card
        className={cn("h-full", onClick && "cursor-pointer transition-shadow hover:shadow-md")}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      >
        <CardContent className="flex items-center gap-3">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", toneClasses?.badge ?? "bg-primary/10 text-primary")}>
            {icon}
          </span>
          <div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className={cn("text-2xl font-semibold tabular-nums", toneClasses?.value)}>{value}</div>
            {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function standingTone(standing: string | undefined): "success" | "warning" | "critical" | undefined {
  if (standing === "Good") return "success";
  if (standing === "Warning") return "warning";
  if (standing === "Hard Limit") return "critical";
  return undefined;
}

/** "92% · 4 absences left" -- the percent/absences-left detail line under a standing's PT/LLAB tile. */
function standingDetail(tally: BucketTally): string | undefined {
  if (tally.percent === undefined) return undefined;
  const left = absencesRemainingForGoodStanding(tally);
  return `${Math.round(tally.percent * 100)}% · ${left} absence${left === 1 ? "" : "s"} left`;
}

// "Pending"/"Submitted" (already turned in, awaiting cadre review) deliberately excluded -- reviewing
// those is POC/Cadre's job, not something the cadet still owes.
const ABSENCE_ACTIONABLE = new Set(["Assigned", "Returned"]);
const DEVIATION_ACTIONABLE = new Set(["Assigned", "Late", "Returned"]);

/** Section 13 -- every GMC or POC cadet's personal, self-service dashboard (own numbers only, no filters needed). Cortes Garay (SAE) gets a trimmed version -- standing detail and the week calendar drop, replaced with an SAE Review glance. */
export function SelfServiceDashboardScreen({
  cadet,
  events,
  attendance,
  absenceMemos,
  deviationMemos,
  fullRoster,
  catalog,
  completions,
  onOpenSaeReview,
  onOpenMissingMemos,
}: Props) {
  const isSae = isCortesGaray(cadet.email);
  const [bucketChoice, setBucketChoice] = useState<"PT" | "LLAB_FM">("PT");
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const saeFlags = useMemo(() => {
    if (!isSae || !fullRoster || !catalog || !completions) return undefined;
    return { acct: accountabilityFlags(events, fullRoster, attendance), to: toFlags(events, catalog, fullRoster, completions) };
  }, [isSae, fullRoster, catalog, completions, events, attendance]);

  // Flat table version of the same two flag lists SAE Review groups by Training Week -- lets the
  // SAE see every outstanding item right on the dashboard without opening the full page. Flags that
  // land on the same calendar day, for the same unit/responsible/status, are folded into one row
  // (e.g. a unit missing both PT and LLAB attendance the same day shows "PT + LLAB" / "4 + 2"),
  // since each would otherwise be a near-duplicate row differing only in which PMT/objective.
  const saeFlagRows = useMemo(() => {
    if (!saeFlags || !fullRoster) return [];
    const nameFor = (email: string): string => {
      const match = fullRoster.find((c) => c.email?.trim().toLowerCase() === email.trim().toLowerCase());
      return match ? formatCadetNameCompact(match) : email;
    };

    interface Raw {
      trainingWeek: number | undefined;
      dateKey: string;
      type: "PMT" | "TO";
      item: string;
      missing: number;
      unit: string;
      responsible: string;
      status: AccountabilityFlag["status"];
    }

    const raw: Raw[] = [
      ...saeFlags.acct.map((f: AccountabilityFlag): Raw => ({
        trainingWeek: f.event.trainingWeek,
        dateKey: f.event.eventDate.slice(0, 10),
        type: "PMT",
        item: f.event.eventType,
        missing: f.missing,
        unit: f.unitValue,
        responsible: nameFor(f.responsibleEmail),
        status: f.status,
      })),
      ...saeFlags.to.map((f: ToFlag): Raw => ({
        trainingWeek: f.trainingWeek,
        dateKey: f.event.eventDate.slice(0, 10),
        type: "TO",
        item: `${PLO_SHORT_CODE[f.objective.plo as PloSection]}-${f.objective.number}`,
        missing: f.missing,
        unit: f.cohort === "GMC" ? f.unitValue! : "POC",
        responsible: nameFor(f.responsibleEmail),
        status: f.status,
      })),
    ];

    const groups = new Map<
      string,
      { trainingWeek: number | undefined; dateKey: string; type: "PMT" | "TO"; unit: string; responsible: string; status: AccountabilityFlag["status"]; items: string[]; missing: number[] }
    >();
    for (const r of raw) {
      const key = `${r.dateKey}|${r.type}|${r.unit}|${r.responsible}|${r.status}`;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.items.includes(r.item)) {
          existing.items.push(r.item);
          existing.missing.push(r.missing);
        }
      } else {
        groups.set(key, { trainingWeek: r.trainingWeek, dateKey: r.dateKey, type: r.type, unit: r.unit, responsible: r.responsible, status: r.status, items: [r.item], missing: [r.missing] });
      }
    }

    return [...groups.values()]
      .map((g) => ({
        trainingWeek: g.trainingWeek,
        twDate: `TW${g.trainingWeek ?? "—"} — ${shortDate(g.dateKey)}`,
        type: g.type,
        item: g.items.join(" + "),
        unit: g.unit,
        responsible: g.responsible,
        missing: g.missing.join(" + "),
        status: g.status,
      }))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "missing" ? -1 : 1;
        return (b.trainingWeek ?? 0) - (a.trainingWeek ?? 0);
      });
  }, [saeFlags, fullRoster]);

  const summary = useMemo(() => computeCadetAttendanceSummary(cadet.id, attendance, pmtEventsById), [cadet.id, attendance, pmtEventsById]);

  const myAbsenceMemos = useMemo(() => absenceMemos.filter((m) => m.cadetId === cadet.id), [absenceMemos, cadet.id]);
  const myDeviationMemos = useMemo(() => deviationMemos.filter((m) => m.cadetId === cadet.id), [deviationMemos, cadet.id]);
  const missingAbsenceCount = useMemo(() => myAbsenceMemos.filter((m) => ABSENCE_ACTIONABLE.has(m.status)).length, [myAbsenceMemos]);
  const missingDeviationCount = useMemo(() => myDeviationMemos.filter((m) => DEVIATION_ACTIONABLE.has(m.status)).length, [myDeviationMemos]);
  const missingMemosCount = missingAbsenceCount + missingDeviationCount;
  const [showAllMemos, setShowAllMemos] = useState(false);

  const memoHistory = useMemo(() => {
    const rows = [
      ...myAbsenceMemos.map((m) => ({
        kind: "Absence" as const,
        assignedAt: m.assignedAt,
        submittedAt: m.submittedAt,
        sortDate: m.submittedAt || m.assignedAt || "",
        status: m.status,
        reason: m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason,
        pdfUrl: m.pdfUrl,
        pdfFileName: m.pdfFileName,
      })),
      ...myDeviationMemos.map((m) => ({
        kind: "Deviation" as const,
        assignedAt: m.dateAssigned,
        submittedAt: m.submittedAt,
        sortDate: m.submittedAt ?? m.dateAssigned,
        status: m.status,
        reason: m.reason === "Other" && m.reasonOther ? `Other: ${m.reasonOther}` : m.reason,
        pdfUrl: m.pdfUrl,
        pdfFileName: m.pdfFileName,
      })),
    ];
    return rows.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  }, [myAbsenceMemos, myDeviationMemos]);
  const visibleMemoHistory = showAllMemos ? memoHistory : memoHistory.slice(0, 10);

  const tableEvents = useMemo(
    () => events.filter((e) => bucketForEventType(e.eventType) === bucketChoice).sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [events, bucketChoice]
  );
  const cellByEvent = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const record of attendance) {
      if (record.cadetId === cadet.id) map.set(record.pmtEventId, record);
    }
    return map;
  }, [attendance, cadet.id]);

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-3">
        <HeroStat
          icon={<Gauge className="h-4.5 w-4.5" />}
          label="PT Standing"
          value={summary.pt.standing ?? "—"}
          detail={standingDetail(summary.pt)}
          tone={standingTone(summary.pt.standing)}
          index={0}
        />
        <HeroStat
          icon={<Gauge className="h-4.5 w-4.5" />}
          label="LLAB/FM/D&C Standing"
          value={summary.llabFm.standing ?? "—"}
          detail={standingDetail(summary.llabFm)}
          tone={standingTone(summary.llabFm.standing)}
          index={1}
        />
        <HeroStat
          icon={<FileText className="h-4.5 w-4.5" />}
          label="Missing Memos"
          value={String(missingMemosCount)}
          tone={missingMemosCount > 0 ? "critical" : "success"}
          index={2}
          onClick={
            missingMemosCount > 0 && onOpenMissingMemos
              ? () => onOpenMissingMemos(missingAbsenceCount > 0 ? "absence" : "deviation")
              : undefined
          }
        />
      </div>

      {isSae ? (
        saeFlags && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                <ShieldAlert className="h-4 w-4 text-primary" />
                Missing Status Log
                {saeFlags.acct.length + saeFlags.to.length > 0 && (
                  <Badge variant="destructive" className="ml-1.5">
                    {saeFlags.acct.length + saeFlags.to.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {saeFlags.acct.length + saeFlags.to.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing flagged right now.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-3 text-sm">
                    <span>
                      Accountability: <strong>{saeFlags.acct.length}</strong> outstanding
                    </span>
                    <span>
                      Training Objectives: <strong>{saeFlags.to.length}</strong> outstanding
                    </span>
                  </div>
                  <div className="max-h-80 overflow-auto rounded-md border border-input">
                    <Table aria-label="Missing status">
                      <TableHeader>
                        <TableRow>
                          <TableHead>TW-Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Responsible</TableHead>
                          <TableHead>Missing</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {saeFlagRows.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-nowrap">{row.twDate}</TableCell>
                            <TableCell className="whitespace-nowrap">{row.type}</TableCell>
                            <TableCell className="max-w-xs truncate" title={row.item}>
                              {row.item}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{row.unit}</TableCell>
                            <TableCell className="whitespace-nowrap">{row.responsible}</TableCell>
                            <TableCell className="whitespace-nowrap">{row.missing}</TableCell>
                            <TableCell>
                              <Badge variant={row.status === "missing" ? "destructive" : "warning"}>
                                {row.status === "missing" ? "Missing" : "Late"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {onOpenSaeReview && (
                    <button type="button" className="mt-3 text-sm text-primary underline underline-offset-2" onClick={onOpenSaeReview}>
                      Open full SAE Review →
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      ) : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                <CalendarDays className="h-4 w-4 text-primary" />
                This week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeekView events={events} />
            </CardContent>
          </Card>
        </>
      )}

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>My attendance</CardTitle>
          <Stepper
            options={[
              { value: "PT", label: "PT" },
              { value: "LLAB_FM", label: "LLAB/FM/D&C" },
            ]}
            value={bucketChoice}
            onChange={(v) => setBucketChoice(v as "PT" | "LLAB_FM")}
          />
        </CardHeader>
        <CardContent>
          {tableEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {bucketChoice === "PT" ? "PT" : "LLAB/FM/D&C"} sessions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="My attendance">
                <TableHeader>
                  <TableRow>
                    {tableEvents.map((e) => (
                      <TableHead key={e.id} className="whitespace-nowrap px-1.5 py-1 text-center text-xs" title={e.title}>
                        {new Date(e.eventDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </TableHead>
                    ))}
                    <TableHead className="whitespace-nowrap px-1.5 py-1 text-center text-xs">Standing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    {tableEvents.map((e) => {
                      const record = cellByEvent.get(e.id);
                      return (
                        <TableCell key={e.id} className="px-1.5 py-1 text-center">
                          {record ? <StatusDot status={record.status} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      );
                    })}
                    <TableCell className="px-1.5 py-1 text-center">
                      <StandingBadge standing={(bucketChoice === "PT" ? summary.pt.standing : summary.llabFm.standing) ?? "Good"} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My memorandum history</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {memoHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No memorandums on file.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table aria-label="My memorandum history">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleMemoHistory.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap">{shortDateTimeBracketed(m.assignedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{shortDateTimeBracketed(m.submittedAt)}</TableCell>
                        <TableCell>
                          <Badge variant={m.kind === "Absence" ? "secondary" : "outline"}>{m.kind}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{m.reason}</TableCell>
                        <TableCell>
                          <Badge variant={memoStatusVariant(m.status)}>{m.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <PdfLinkButton url={m.pdfUrl} name={m.pdfFileName} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {memoHistory.length > 10 && (
                <button
                  type="button"
                  className="mt-3 text-sm text-primary underline underline-offset-2"
                  onClick={() => setShowAllMemos((v) => !v)}
                >
                  {showAllMemos ? "Show last 10 only" : `Show all ${memoHistory.length}`}
                </button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
