import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Users, FileText, Gauge, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { bucketForEventType, SEMESTER_PMT_TOTALS } from "../../domain/constants";
import { computeCadetAttendanceSummary, computeCombinedPercent } from "../../domain/attendance";
import { shortDate } from "../../domain/memoAnalytics";
import { Stepper } from "../../components/analytics/Stepper";
import { WeekView } from "../accountability/DashboardScreen";
import { CadetBucketStats, StatusDot, StandingBadge } from "../analytics/AccountabilityAnalyticsView";
import type { AbsenceMemo, Attendance, Cadet, DeviationMemo, PmtEvent } from "../../domain/types";

interface Props {
  cadet: Cadet;
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
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

function pct(n: number | undefined): string {
  return n === undefined ? "—" : `${Math.round(n * 100)}%`;
}

const ABSENCE_ACTIONABLE = new Set(["Assigned", "Pending", "Returned"]);
const DEVIATION_ACTIONABLE = new Set(["Assigned", "Late", "Returned"]);

/** Section 13 -- every GMC cadet's personal, self-service dashboard (own numbers only, no filters needed). */
export function GmcDashboardScreen({ cadet, roster, events, attendance, absenceMemos, deviationMemos }: Props) {
  const [bucketChoice, setBucketChoice] = useState<"PT" | "LLAB_FM">("PT");
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const summary = useMemo(() => computeCadetAttendanceSummary(cadet.id, attendance, pmtEventsById), [cadet.id, attendance, pmtEventsById]);

  const flightMates = useMemo(
    () => roster.filter((p) => p.status === "Active" && !p.isCadre && p.flight === cadet.flight),
    [roster, cadet.flight]
  );
  const cohortCombinedPercent = useMemo(() => {
    const percents = flightMates.map((p) => computeCombinedPercent(p.id, attendance, pmtEventsById));
    return percents.length === 0 ? undefined : percents.reduce((a, b) => a + b, 0) / percents.length;
  }, [flightMates, attendance, pmtEventsById]);

  const myAbsenceMemos = useMemo(() => absenceMemos.filter((m) => m.cadetId === cadet.id), [absenceMemos, cadet.id]);
  const myDeviationMemos = useMemo(() => deviationMemos.filter((m) => m.cadetId === cadet.id), [deviationMemos, cadet.id]);
  const missingMemosCount =
    myAbsenceMemos.filter((m) => ABSENCE_ACTIONABLE.has(m.status)).length + myDeviationMemos.filter((m) => DEVIATION_ACTIONABLE.has(m.status)).length;

  const memoHistory = useMemo(() => {
    const rows = [
      ...myAbsenceMemos.map((m) => ({ kind: "Absence" as const, date: m.submittedAt || m.assignedAt || "", status: m.status, reason: m.reason })),
      ...myDeviationMemos.map((m) => ({ kind: "Deviation" as const, date: m.submittedAt ?? m.dateAssigned, status: m.status, reason: m.reason })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [myAbsenceMemos, myDeviationMemos]);

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
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        My Dashboard
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <HeroStat icon={<Gauge className="h-4.5 w-4.5" />} label="PT Standing" value={summary.pt.standing ?? "—"} index={0} />
        <HeroStat icon={<Gauge className="h-4.5 w-4.5" />} label="LLAB/FM/D&C Standing" value={summary.llabFm.standing ?? "—"} index={1} />
        <HeroStat
          icon={<FileText className="h-4.5 w-4.5" />}
          label="Missing memorandums"
          value={String(missingMemosCount)}
          tone={missingMemosCount > 0 ? "critical" : undefined}
          index={2}
        />
        <HeroStat icon={<Users className="h-4.5 w-4.5" />} label="Flight combined %" value={pct(cohortCombinedPercent)} index={3} />
      </div>

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

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <CadetBucketStats label="PT" tally={summary.pt} fixedTotal={SEMESTER_PMT_TOTALS.PT} />
        <CadetBucketStats label="LLAB/FM/D&C" tally={summary.llabFm} fixedTotal={SEMESTER_PMT_TOTALS.LLAB_FM} />
      </div>

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
                      <TableHead key={e.id} className="whitespace-nowrap text-center" title={e.title}>
                        {new Date(e.eventDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </TableHead>
                    ))}
                    <TableHead className="whitespace-nowrap text-center">Standing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    {tableEvents.map((e) => {
                      const record = cellByEvent.get(e.id);
                      return (
                        <TableCell key={e.id} className="text-center">
                          {record ? <StatusDot status={record.status} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
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
            <Table aria-label="My memorandum history">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memoHistory.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{shortDate(m.date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.kind}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{m.reason}</TableCell>
                    <TableCell>{m.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
