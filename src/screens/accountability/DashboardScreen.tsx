import { useMemo } from "react";
import { motion } from "motion/react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LayoutDashboard, Users, TriangleAlert, ShieldAlert, ClipboardCheck, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeCadetAttendanceSummary, isPostAccountabilityWindowClosed } from "../../domain/attendance";
import type { PmtEvent, Attendance, Cadet } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  /** Clicking a PMT in the "Accountability" card jumps to the Accountability (attendance-taking) tab with that PMT pre-selected. */
  onNavigateToPmt: (pmtEventId: string) => void;
}

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

export function DashboardScreen({ roster, events, attendance, onNavigateToPmt }: Props) {
  const activeRoster = useMemo(() => roster.filter((p) => p.status === "Active"), [roster]);
  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const standings = useMemo(
    () => activeRoster.map((person) => ({ person, summary: computeCadetAttendanceSummary(person.id, attendance, pmtEventsById) })),
    [activeRoster, attendance, pmtEventsById]
  );

  // Worst-bucket-wins per cadet -- a cadet with PT=Good but LLAB/FM=Hard Limit counts toward the
  // Hard Limit tile, not Warning, since Hard Limit is the more severe standing.
  const warningCount = standings.filter(
    (s) =>
      (s.summary.pt.standing === "Warning" || s.summary.llabFm.standing === "Warning") &&
      s.summary.pt.standing !== "Hard Limit" &&
      s.summary.llabFm.standing !== "Hard Limit"
  ).length;
  const hardLimitCount = standings.filter((s) => s.summary.pt.standing === "Hard Limit" || s.summary.llabFm.standing === "Hard Limit").length;

  const missingAccountability = useMemo(() => {
    const withRecords = new Set(attendance.map((a) => a.pmtEventId));
    return events
      .filter((e) => isPostAccountabilityWindowClosed(e) && !withRecords.has(e.id))
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [events, attendance]);

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        Dashboard
      </h2>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <HeroStat icon={<Users className="h-4.5 w-4.5" />} label="Active roster" value={String(activeRoster.length)} index={0} />
        <HeroStat
          icon={<TriangleAlert className="h-4.5 w-4.5" />}
          label="Warning standing"
          value={String(warningCount)}
          tone={warningCount > 0 ? "critical" : undefined}
          index={1}
        />
        <HeroStat
          icon={<ShieldAlert className="h-4.5 w-4.5" />}
          label="Hard Limit standing"
          value={String(hardLimitCount)}
          tone={hardLimitCount > 0 ? "critical" : undefined}
          index={2}
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

      <Card>
        <CardHeader>
          <CardTitle>
            <ClipboardCheck className="h-4 w-4 text-destructive" />
            Accountability
          </CardTitle>
        </CardHeader>
        <CardContent>
          {missingAccountability.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing missing right now.</p>
          ) : (
            <div className="space-y-1.5">
              {missingAccountability.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onNavigateToPmt(e.id)}
                  className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-sm hover:bg-accent"
                >
                  <span>
                    {e.trainingWeek !== undefined ? `TW ${e.trainingWeek} - ` : ""}
                    {e.title} ({new Date(e.eventDate).toLocaleDateString()})
                  </span>
                  <span className="text-muted-foreground">{e.eventType}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
