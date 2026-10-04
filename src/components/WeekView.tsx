import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PmtEvent } from "../domain/types";

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

/** This calendar week's PMTs, Mon-Sun -- shared by the GMC/POC self-service Dashboard (Section 13). Used to live in the (now-deleted) Accountability Dashboard screen. */
export function WeekView({ events }: { events: PmtEvent[] }) {
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
