import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutDashboard, Users, TriangleAlert, ClipboardCheck, CalendarX, UserX, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeCadetAttendanceSummary, findTrainingWeekConflicts, findStaleRepositions, isPostAccountabilityWindowClosed } from "../../domain/attendance";
import { deriveClass, FLIGHTS, GROUPS, type Flight, type Group, type Standing } from "../../domain/constants";
import { compareByLastName } from "../../domain/nameUtils";
import type { Attendance, ExtraEvent, PmtEvent, Cadet } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  extraEvents: ExtraEvent[];
  attendance: Attendance[];
}

const STANDING_OPTIONS: Standing[] = ["Good", "Warning", "Hard Limit"];

function isoWeekStart(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Same palette as the Events tab's Calendar view, so a PMT type reads the same color everywhere.
const EVENT_TYPE_STYLES: Record<string, string> = {
  PT: "bg-primary/10 text-primary",
  LLAB: "bg-success/15 text-success",
  FM: "bg-warning/20 text-warning-foreground",
  "D&C": "bg-secondary text-secondary-foreground",
};

function WeekView({ events }: { events: PmtEvent[] }) {
  const days = useMemo(() => {
    const start = isoWeekStart(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PmtEvent[]>();
    for (const e of events) {
      const key = e.eventDate.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const todayKey = new Date().toISOString().slice(0, 10);

  // The week's Training Week number -- whichever TW the days' own events carry (normally all the
  // same one; falls back to "—" if nothing this week has a TW set yet).
  const weekTw = useMemo(() => {
    for (const list of eventsByDay.values()) {
      const withTw = list.find((e) => e.trainingWeek !== undefined);
      if (withTw) return withTw.trainingWeek;
    }
    return undefined;
  }, [eventsByDay]);

  return (
    <div>
      <div className="mb-2 text-sm font-medium text-muted-foreground">{weekTw !== undefined ? `Training Week ${weekTw}` : "Training Week —"}</div>
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-3 pb-1">
          {days.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const dayEvents = (eventsByDay.get(key) ?? []).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={cn("w-40 shrink-0 rounded-md border border-input p-2", isToday && "border-primary bg-primary/5")}
              >
                <div className={cn("mb-1.5 text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                  {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </div>
                {dayEvents.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">—</p>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map((e) => (
                      <div key={e.id} className={cn("rounded px-1.5 py-1 text-[11px]", EVENT_TYPE_STYLES[e.eventType] ?? "bg-muted")}>
                        <div className="font-medium">{e.eventType}</div>
                        <div className="truncate opacity-80" title={e.title}>
                          {e.title}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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

export function DashboardScreen({ roster, events, extraEvents, attendance }: Props) {
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [groupFilter, setGroupFilter] = useState<Group | "All">("All");
  const [standingFilter, setStandingFilter] = useState<Standing | "All">("All");

  // Group and Flight are mutually exclusive -- picking one clears the other.
  const handleFlightChange = (v: string) => {
    setFlightFilter(v as Flight | "All");
    if (v !== "All") setGroupFilter("All");
  };
  const handleGroupChange = (v: string) => {
    setGroupFilter(v as Group | "All");
    if (v !== "All") setFlightFilter("All");
  };

  const activeRoster = useMemo(() => roster.filter((p) => p.status === "Active"), [roster]);
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const standings = useMemo(
    () =>
      activeRoster
        .map((person) => ({ person, summary: computeCadetAttendanceSummary(person.id, attendance, pmtEventsById) }))
        .sort((a, b) => compareByLastName(a.person.name, b.person.name)),
    [activeRoster, attendance, pmtEventsById]
  );

  // Unique cadets flagged (below Good in at least one bucket) -- kept as the single source of
  // truth for this count. The Analytics tab's "below-Good standing flags" stat mirrors this same
  // logic (unique cadets, not bucket-instances) so the two numbers never diverge again.
  const flaggedCount = standings.filter((s) => s.summary.pt.standing !== "Good" || s.summary.llabFm.standing !== "Good").length;

  const filteredStandings = useMemo(
    () =>
      standings.filter(({ person, summary }) => {
        if (flightFilter !== "All" && person.flight !== flightFilter) return false;
        if (groupFilter !== "All" && person.group !== groupFilter) return false;
        if (standingFilter !== "All" && summary.pt.standing !== standingFilter && summary.llabFm.standing !== standingFilter) return false;
        return true;
      }),
    [standings, flightFilter, groupFilter, standingFilter]
  );

  const missingPost = useMemo(() => {
    const withRecords = new Set(attendance.map((a) => a.pmtEventId));
    return events.filter((e) => isPostAccountabilityWindowClosed(e) && !withRecords.has(e.id));
  }, [events, attendance]);

  const twConflicts = useMemo(() => findTrainingWeekConflicts(events), [events]);
  const staleRepositions = useMemo(() => findStaleRepositions(extraEvents, pmtEventsById), [extraEvents, pmtEventsById]);
  const recentlyInactive = useMemo(
    () =>
      roster.filter((p) => {
        if (p.status !== "Inactive" || !p.statusChangedDate) return false;
        const days = (Date.now() - new Date(p.statusChangedDate).getTime()) / 86_400_000;
        return days <= 14;
      }),
    [roster]
  );

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        Dashboard
      </h2>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <HeroStat icon={<Users className="h-4.5 w-4.5" />} label="Active roster" value={String(activeRoster.length)} index={0} />
        <HeroStat
          icon={<TriangleAlert className="h-4.5 w-4.5" />}
          label="Below Good standing"
          value={String(flaggedCount)}
          tone={flaggedCount > 0 ? "critical" : undefined}
          index={1}
        />
        <HeroStat
          icon={<ClipboardCheck className="h-4.5 w-4.5" />}
          label="Missing Post-Accountability"
          value={String(missingPost.length)}
          tone={missingPost.length > 0 ? "critical" : undefined}
          index={2}
        />
        <HeroStat
          icon={<CalendarX className="h-4.5 w-4.5" />}
          label="TW conflicts"
          value={String(twConflicts.length)}
          tone={twConflicts.length > 0 ? "critical" : undefined}
          index={3}
        />
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

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <ClipboardCheck className="h-4 w-4 text-destructive" />
              Missing Post-Accountability
            </CardTitle>
          </CardHeader>
          <CardContent>
            {missingPost.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing missing right now.</p>
            ) : (
              <div className="space-y-1.5">
                {missingPost.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span>
                      {e.title} <span className="text-muted-foreground">({e.eventType})</span>
                    </span>
                    <span className="text-muted-foreground">{new Date(e.eventDate).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <UserX className="h-4 w-4 text-primary" />
              Recently deactivated
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentlyInactive.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one recently marked Inactive.</p>
            ) : (
              <div className="space-y-1.5">
                {recentlyInactive.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">{p.statusChangedDate}</span>
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
              Stale reposition references
            </CardTitle>
          </CardHeader>
          <CardContent>
            {staleRepositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">None -- every reposition still points at a real PMT.</p>
            ) : (
              <div className="space-y-1.5">
                {staleRepositions.map((e) => (
                  <div key={e.id} className="text-sm">
                    {e.title} <span className="text-muted-foreground">— the PMT it repositions has been deleted or moved.</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            <Users className="h-4 w-4 text-primary" />
            Standing by cadet
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={flightFilter} onValueChange={handleFlightChange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Flight" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All flights</SelectItem>
                {FLIGHTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f} Flight
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={groupFilter} onValueChange={handleGroupChange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All groups</SelectItem>
                {GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={standingFilter} onValueChange={(v) => setStandingFilter(v as Standing | "All")}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Standing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All standings</SelectItem>
                {STANDING_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <Table aria-label="Standing by cadet">
            <TableHeader>
              <TableRow>
                <TableHead>Cadet</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>PT %</TableHead>
                <TableHead>PT Standing</TableHead>
                <TableHead>LLAB/FM %</TableHead>
                <TableHead>LLAB/FM Standing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStandings.map(({ person, summary }) => (
                <TableRow key={person.id}>
                  <TableCell>{person.name}</TableCell>
                  <TableCell>{deriveClass(person.asClass, person.isCadre)}</TableCell>
                  <TableCell>{summary.pt.percent === undefined ? "—" : `${Math.round(summary.pt.percent * 100)}%`}</TableCell>
                  <TableCell>
                    <StandingBadge standing={summary.pt.standing} />
                  </TableCell>
                  <TableCell>{summary.llabFm.percent === undefined ? "—" : `${Math.round(summary.llabFm.percent * 100)}%`}</TableCell>
                  <TableCell>
                    <StandingBadge standing={summary.llabFm.standing} />
                  </TableCell>
                </TableRow>
              ))}
              {filteredStandings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No active cadets match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StandingBadge({ standing }: { standing: "Good" | "Warning" | "Hard Limit" | undefined }) {
  if (!standing) return <span className="text-muted-foreground">—</span>;
  const variant = standing === "Good" ? "success" : standing === "Warning" ? "warning" : "destructive";
  return <Badge variant={variant}>{standing}</Badge>;
}
