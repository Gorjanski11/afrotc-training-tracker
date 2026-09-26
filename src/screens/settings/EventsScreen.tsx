import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Plus, Pencil, Trash2, TriangleAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { findTrainingWeekConflicts } from "../../domain/attendance";
import { buildMonthGrid, isSameDay, isSameMonth, addMonths } from "../../domain/calendarUtils";
import { PmtEventFormDialog } from "../../components/accountability/PmtEventFormDialog";
import { ExtraEventFormDialog } from "../../components/accountability/ExtraEventFormDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { PmtEventInput } from "../../hooks/usePmtEvents";
import type { ExtraEventInput } from "../../hooks/useExtraEvents";
import type { ExtraEvent, PmtEvent } from "../../domain/types";

interface Props {
  events: PmtEvent[];
  extraEvents: ExtraEvent[];
  createEvent: (input: PmtEventInput) => Promise<PmtEvent>;
  updateEvent: (id: string, input: PmtEventInput) => Promise<PmtEvent>;
  deleteEvent: (id: string) => Promise<void>;
  createExtraEvent: (input: ExtraEventInput) => Promise<ExtraEvent>;
  updateExtraEvent: (id: string, input: ExtraEventInput) => Promise<void>;
  deleteExtraEvent: (id: string) => Promise<void>;
}

type Tab = "pmt" | "extra" | "calendar";

const EVENT_TYPE_STYLES: Record<string, string> = {
  PT: "bg-primary/10 text-primary",
  LLAB: "bg-success/15 text-success",
  FM: "bg-warning/20 text-warning-foreground",
  "D&C": "bg-secondary text-secondary-foreground",
};

function EventChip({ label, type, onClick }: { label: string; type: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-xs", EVENT_TYPE_STYLES[type] ?? "bg-secondary")}
    >
      {label}
    </button>
  );
}

export function EventsScreen({
  events,
  extraEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  createExtraEvent,
  updateExtraEvent,
  deleteExtraEvent,
}: Props) {
  const [tab, setTab] = useState<Tab>("pmt");
  const [pmtFormOpen, setPmtFormOpen] = useState(false);
  const [editingPmt, setEditingPmt] = useState<PmtEvent | undefined>();
  const [deletingPmt, setDeletingPmt] = useState<PmtEvent | undefined>();
  const [extraFormOpen, setExtraFormOpen] = useState(false);
  const [editingExtra, setEditingExtra] = useState<ExtraEvent | undefined>();
  const [deletingExtra, setDeletingExtra] = useState<ExtraEvent | undefined>();
  const [calendarAnchor, setCalendarAnchor] = useState(new Date());

  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate)), [events]);
  const sortedExtraEvents = useMemo(() => [...extraEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate)), [extraEvents]);
  const conflicts = useMemo(() => findTrainingWeekConflicts(events), [events]);
  const conflictEventIds = useMemo(() => new Set(conflicts.flatMap((c) => c.eventIds)), [conflicts]);

  const pmtByDay = useMemo(() => {
    const map = new Map<string, PmtEvent[]>();
    for (const e of events) {
      const key = new Date(e.eventDate).toDateString();
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return map;
  }, [events]);
  const extraByDay = useMemo(() => {
    const map = new Map<string, ExtraEvent[]>();
    for (const e of extraEvents) {
      const key = new Date(e.eventDate).toDateString();
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return map;
  }, [extraEvents]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <CalendarDays className="h-5 w-5 text-primary" />
          Events
        </h2>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="pmt">PMTs</TabsTrigger>
            <TabsTrigger value="extra">Extra Events</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {conflicts.length} Training Week conflict{conflicts.length === 1 ? "" : "s"}: events land in the same calendar week with different TW
            numbers (weeks of {conflicts.map((c) => c.calendarWeekOf).join(", ")}).
          </span>
        </div>
      )}

      {tab === "pmt" ? (
        <>
          <div className="mb-4 flex justify-end">
            <Button
              onClick={() => {
                setEditingPmt(undefined);
                setPmtFormOpen(true);
              }}
            >
              <Plus />
              Add PMT
            </Button>
          </div>
          <Table aria-label="PMT events">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>TW</TableHead>
                <TableHead>Location</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{new Date(event.eventDate).toLocaleString()}</TableCell>
                  <TableCell>{event.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{event.eventType}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {event.trainingWeek ?? "—"}
                      {conflictEventIds.has(event.id) && <TriangleAlert className="h-3.5 w-3.5 text-destructive" />}
                    </span>
                  </TableCell>
                  <TableCell>{event.location || "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingPmt(event);
                          setPmtFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeletingPmt(event)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sortedEvents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No PMT events yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      ) : tab === "extra" ? (
        <>
          <div className="mb-4 flex justify-end">
            <Button
              onClick={() => {
                setEditingExtra(undefined);
                setExtraFormOpen(true);
              }}
            >
              <Plus />
              Add Extra Event
            </Button>
          </div>
          <Table aria-label="Extra events">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedExtraEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{new Date(event.eventDate).toLocaleString()}</TableCell>
                  <TableCell>{event.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{event.eventType}</Badge>
                  </TableCell>
                  <TableCell>{event.location || "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingExtra(event);
                          setExtraFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeletingExtra(event)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {sortedExtraEvents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No extra events yet. These never affect accountability -- just a simple attendee list.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCalendarAnchor(addMonths(calendarAnchor, -1))}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCalendarAnchor(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCalendarAnchor(addMonths(calendarAnchor, 1))}>
              <ChevronRight />
            </Button>
            <span className="text-lg font-medium">{calendarAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[700px] grid-cols-7 gap-px overflow-hidden rounded-md border border-input bg-input">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="bg-muted px-2 py-1 text-center text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {buildMonthGrid(calendarAnchor)
                .flat()
                .map((day) => {
                  const dayKey = day.toDateString();
                  const dayPmt = pmtByDay.get(dayKey) ?? [];
                  const dayExtra = extraByDay.get(dayKey) ?? [];
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-24 cursor-pointer bg-background p-1",
                        !isSameMonth(day, calendarAnchor) && "bg-muted/40 text-muted-foreground",
                        isSameDay(day, new Date()) && "ring-1 ring-inset ring-primary"
                      )}
                      onClick={() => {
                        setEditingPmt(undefined);
                        setPmtFormOpen(true);
                      }}
                    >
                      <div className="mb-1 text-xs">{day.getDate()}</div>
                      <div className="flex flex-col gap-0.5">
                        {dayPmt.map((e) => (
                          <EventChip
                            key={e.id}
                            label={`${e.eventType} · ${e.title}`}
                            type={e.eventType}
                            onClick={() => {
                              setEditingPmt(e);
                              setPmtFormOpen(true);
                            }}
                          />
                        ))}
                        {dayExtra.map((e) => (
                          <EventChip
                            key={e.id}
                            label={`Extra · ${e.title}`}
                            type="extra"
                            onClick={() => {
                              setEditingExtra(e);
                              setExtraFormOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {pmtFormOpen && (
        <PmtEventFormDialog
          open
          onClose={() => setPmtFormOpen(false)}
          allEvents={events}
          existingEvent={editingPmt}
          onSave={async (input) => {
            if (editingPmt) await updateEvent(editingPmt.id, input);
            else await createEvent(input);
          }}
        />
      )}
      {deletingPmt && (
        <ConfirmDialog
          open
          onClose={() => setDeletingPmt(undefined)}
          title="Delete PMT?"
          description={`This deletes "${deletingPmt.title}" and cannot be undone. Attendance records already logged against it are not deleted and will become orphaned.`}
          confirmLabel="Delete"
          onConfirm={() => deleteEvent(deletingPmt.id)}
        />
      )}

      {extraFormOpen && (
        <ExtraEventFormDialog
          open
          onClose={() => setExtraFormOpen(false)}
          existingEvent={editingExtra}
          pmtEvents={events}
          onSave={async (input) => {
            if (editingExtra) await updateExtraEvent(editingExtra.id, input);
            else await createExtraEvent(input);
          }}
        />
      )}
      {deletingExtra && (
        <ConfirmDialog
          open
          onClose={() => setDeletingExtra(undefined)}
          title="Delete extra event?"
          description={`This deletes "${deletingExtra.title}" and cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => deleteExtraEvent(deletingExtra.id)}
        />
      )}
    </div>
  );
}
