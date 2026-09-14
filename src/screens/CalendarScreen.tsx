import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildMonthGrid, buildWeekDays, isSameDay, isSameMonth, addMonths, addDays } from "../domain/calendarUtils";
import { EventDetailDialog } from "../components/EventDetailDialog";
import { EventFormDialog } from "../components/EventFormDialog";
import type { PmtEventInput } from "../hooks/usePmtEvents";
import type { PmtEvent, TrainingObjective } from "../domain/types";

type ViewMode = "month" | "week" | "list";

interface Props {
  events: PmtEvent[];
  catalog: TrainingObjective[];
  createEvent: (input: PmtEventInput) => Promise<PmtEvent>;
  updateEvent: (id: string, input: PmtEventInput) => Promise<PmtEvent>;
  deleteEvent: (id: string) => Promise<void>;
}

const EVENT_TYPE_STYLES: Record<string, string> = {
  LLAB: "bg-primary/10 text-primary",
  FM: "bg-warning/20 text-warning-foreground",
  "D&C": "bg-success/15 text-success",
};

function EventChip({ event, onClick }: { event: PmtEvent; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-xs", EVENT_TYPE_STYLES[event.eventType] ?? "bg-secondary")}
    >
      {new Date(event.eventDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} {event.title}
    </button>
  );
}

export function CalendarScreen({ events, catalog, createEvent, updateEvent, deleteEvent }: Props) {
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<PmtEvent | undefined>();
  const [formState, setFormState] = useState<{ event?: PmtEvent; defaultDate?: string } | undefined>();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PmtEvent[]>();
    for (const ev of events) {
      const key = new Date(ev.eventDate).toDateString();
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return map;
  }, [events]);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate)), [events]);

  const navLabel =
    view === "list"
      ? "All events"
      : view === "week"
        ? `Week of ${buildWeekDays(anchor)[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const goPrev = () => setAnchor(view === "week" ? addDays(anchor, -7) : addMonths(anchor, -1));
  const goNext = () => setAnchor(view === "week" ? addDays(anchor, 7) : addMonths(anchor, 1));
  const goToday = () => setAnchor(new Date());

  return (
    <div>
      <h2 className="mb-2 text-2xl font-semibold">PMT Calendar</h2>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {view !== "list" && (
            <>
              <Button variant="outline" size="icon" onClick={goPrev}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={goNext}>
                <ChevronRight />
              </Button>
            </>
          )}
          <span className="text-lg font-medium">{navLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => setFormState({ defaultDate: new Date().toISOString().slice(0, 16) })}>
            <Plus /> Add Event
          </Button>
        </div>
      </div>

      {view === "month" && (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-input bg-input">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {buildMonthGrid(anchor)
            .flat()
            .map((day) => {
              const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-24 bg-background p-1",
                    !isSameMonth(day, anchor) && "bg-muted/40 text-muted-foreground",
                    isSameDay(day, new Date()) && "ring-1 ring-inset ring-primary"
                  )}
                  onClick={() => setFormState({ defaultDate: `${day.toISOString().slice(0, 10)}T08:00` })}
                >
                  <div className="mb-1 text-xs">{day.getDate()}</div>
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.map((ev) => (
                      <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {view === "week" && (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-input bg-input">
          {buildWeekDays(anchor).map((day) => {
            const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
            return (
              <div key={day.toISOString()} className={cn("min-h-64 bg-background p-2", isSameDay(day, new Date()) && "ring-1 ring-inset ring-primary")}>
                <div className="mb-2 text-xs font-medium">
                  {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                </div>
                <div className="flex flex-col gap-1">
                  {dayEvents.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    dayEvents.map((ev) => <EventChip key={ev.id} event={ev} onClick={() => setSelectedEvent(ev)} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <div className="divide-y divide-input rounded-md border border-input">
          {sortedEvents.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No PMT events yet.</div>
          ) : (
            sortedEvents.map((ev) => (
              <button
                key={ev.id}
                className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left hover:bg-muted/50"
                onClick={() => setSelectedEvent(ev)}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{ev.eventType}</Badge>
                  <span className="font-medium">{ev.title}</span>
                  {ev.location && <span className="text-sm text-muted-foreground">{ev.location}</span>}
                </div>
                <span className="text-sm text-muted-foreground">
                  {new Date(ev.eventDate).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {selectedEvent && (
        <EventDetailDialog
          open
          onClose={() => setSelectedEvent(undefined)}
          event={selectedEvent}
          catalog={catalog}
          onEdit={() => {
            setFormState({ event: selectedEvent });
            setSelectedEvent(undefined);
          }}
          onDelete={() => deleteEvent(selectedEvent.id)}
        />
      )}

      {formState && (
        <EventFormDialog
          open
          onClose={() => setFormState(undefined)}
          catalog={catalog}
          existingEvent={formState.event}
          defaultDate={formState.defaultDate}
          onSave={async (input) => {
            if (formState.event) {
              await updateEvent(formState.event.id, input);
            } else {
              await createEvent(input);
            }
          }}
        />
      )}
    </div>
  );
}
