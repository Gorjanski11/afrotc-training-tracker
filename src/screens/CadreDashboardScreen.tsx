import { useMemo } from "react";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, FileText, ClipboardList, TriangleAlert, Users, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeCadetAttendanceSummary } from "../domain/attendance";
import { computeUnitComparison } from "../domain/accountabilityAnalytics";
import { deriveClass, type Standing } from "../domain/constants";
import { formatCadetName } from "../domain/nameUtils";
import { shortDate } from "../domain/memoAnalytics";
import type { AbsenceMemo, Attendance, Cadet, DeviationMemo, PmtEvent } from "../domain/types";
import type { DashboardNavIntent } from "../domain/dashboardNav";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
  userEmail: string | null | undefined;
  navigateTo: (tab: "memoReview" | "analytics", intent: DashboardNavIntent) => void;
}

function HeroStat({
  icon,
  label,
  value,
  tone,
  index,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "critical";
  index: number;
  onClick?: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.05 }}>
      <Card className={cn("hover:shadow-md", onClick && "cursor-pointer")} onClick={onClick}>
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

const STANDING_SEVERITY: Record<Standing, number> = { Good: 0, Warning: 1, "Hard Limit": 2 };

/** Section 7 -- true Cadre's landing dashboard (My Dashboard tab), since they no longer see Accountability/TO's/Memo Submission directly. */
export function CadreDashboardScreen({ roster, events, attendance, absenceMemos, deviationMemos, userEmail, navigateTo }: Props) {
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const activeRoster = useMemo(() => roster.filter((c) => !c.isCadre && c.status === "Active"), [roster]);

  const pendingAbsence = useMemo(() => absenceMemos.filter((m) => m.status === "Pending"), [absenceMemos]);
  const normalizedEmail = userEmail?.trim().toLowerCase();
  const pendingDeviation = useMemo(
    () => deviationMemos.filter((m) => m.status === "Submitted" && m.assignedByEmail?.trim().toLowerCase() === normalizedEmail),
    [deviationMemos, normalizedEmail]
  );

  const warningCadets = useMemo(() => {
    return activeRoster
      .map((cadet) => {
        const summary = computeCadetAttendanceSummary(cadet.id, attendance, pmtEventsById);
        const standings = [summary.pt.standing, summary.llabFm.standing].filter((s): s is Standing => !!s);
        if (standings.length === 0) return undefined;
        const overall = standings.reduce((worst, s) => (STANDING_SEVERITY[s] > STANDING_SEVERITY[worst] ? s : worst));
        return { cadet, overall };
      })
      .filter((row): row is { cadet: Cadet; overall: Standing } => !!row && (row.overall === "Warning" || row.overall === "Hard Limit"))
      .sort((a, b) => a.cadet.name.localeCompare(b.cadet.name));
  }, [activeRoster, attendance, pmtEventsById]);

  const UNIT_ORDER = ["CWL", "TRG", "OG", "MSG", "WSG", "M", "N", "O", "P"];
  const unitRows = useMemo(() => {
    const rows = computeUnitComparison(activeRoster, attendance, pmtEventsById, (p) => (deriveClass(p.asClass, p.isCadre) === "GMC" ? p.flight : p.group));
    return [...rows].sort((a, b) => UNIT_ORDER.indexOf(a.unit) - UNIT_ORDER.indexOf(b.unit));
  }, [activeRoster, attendance, pmtEventsById]);

  const memoHistory = useMemo(() => {
    const rows = [
      ...absenceMemos.map((m) => ({ kind: "Absence" as const, cadetName: m.cadetName, date: m.submittedAt || m.assignedAt || "", status: m.status })),
      ...deviationMemos.map((m) => ({ kind: "Deviation" as const, cadetName: m.cadetName, date: m.submittedAt ?? m.dateAssigned, status: m.status })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  }, [absenceMemos, deviationMemos]);

  const goToCadetAccountability = (cadet: Cadet) => {
    const isGmc = deriveClass(cadet.asClass, cadet.isCadre) === "GMC";
    navigateTo("analytics", { kind: "accountabilityAnalytics", cadetId: cadet.id, group: isGmc ? undefined : cadet.group, flight: isGmc ? cadet.flight : undefined });
  };
  const goToUnitAccountability = (unit: string, isGmc: boolean) => {
    navigateTo("analytics", { kind: "accountabilityAnalytics", group: isGmc ? undefined : (unit as Cadet["group"]), flight: isGmc ? (unit as Cadet["flight"]) : undefined });
  };

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        Dashboard
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <HeroStat
          icon={<FileText className="h-4.5 w-4.5" />}
          label="Absence Memos pending review"
          value={String(pendingAbsence.length)}
          tone={pendingAbsence.length > 0 ? "critical" : undefined}
          index={0}
          onClick={() => navigateTo("memoReview", { kind: "memoReview", screen: "absence" })}
        />
        <HeroStat
          icon={<ClipboardList className="h-4.5 w-4.5" />}
          label="Deviation Memos pending review"
          value={String(pendingDeviation.length)}
          tone={pendingDeviation.length > 0 ? "critical" : undefined}
          index={1}
          onClick={() => navigateTo("memoReview", { kind: "memoReview", screen: "deviation" })}
        />
        <HeroStat icon={<TriangleAlert className="h-4.5 w-4.5" />} label="Cadets on Warning or lower" value={String(warningCadets.length)} index={2} />
        <HeroStat icon={<Users className="h-4.5 w-4.5" />} label="Active roster" value={String(activeRoster.length)} index={3} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <TriangleAlert className="h-4 w-4 text-warning" />
              Cadets on Warning or lower
            </CardTitle>
          </CardHeader>
          <CardContent>
            {warningCadets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one is currently Warning or lower.</p>
            ) : (
              <div className="space-y-1">
                {warningCadets.map(({ cadet, overall }) => (
                  <button
                    key={cadet.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-sm px-1.5 py-1 text-left text-sm hover:bg-accent"
                    onClick={() => goToCadetAccountability(cadet)}
                  >
                    <span>{formatCadetName(cadet)}</span>
                    <Badge variant={overall === "Hard Limit" ? "destructive" : "warning"}>{overall}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <BarChart2 className="h-4 w-4 text-primary" />
              Attendance % by Group / Flight
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unitRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-1">
                {unitRows.map((row) => {
                  const isGmc = !(["OG", "MSG", "WSG", "TRG", "CWL"] as const).includes(row.unit as never);
                  return (
                    <button
                      key={row.unit}
                      type="button"
                      className="flex w-full items-center justify-between rounded-sm px-1.5 py-1 text-left text-sm hover:bg-accent"
                      onClick={() => goToUnitAccountability(row.unit, isGmc)}
                    >
                      <span>
                        {row.unit} {isGmc ? "Flight" : "Group"} <span className="text-xs text-muted-foreground">({row.cadetCount})</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        PT <strong className="font-bold text-foreground">{row.ptPercent === undefined ? "—" : `${Math.round(row.ptPercent * 100)}%`}</strong>{" "}
                        · LLAB/FM/D&amp;C{" "}
                        <strong className="font-bold text-foreground">
                          {row.llabFmPercent === undefined ? "—" : `${Math.round(row.llabFmPercent * 100)}%`}
                        </strong>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Memorandum history (last 15)</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {memoHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No memorandums on file.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Memorandum history">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Cadet</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memoHistory.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>{shortDate(m.date)}</TableCell>
                      <TableCell>{m.cadetName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.kind}</Badge>
                      </TableCell>
                      <TableCell>{m.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
