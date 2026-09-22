import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TriangleAlert } from "lucide-react";
import { PMT_EVENT_TYPES, type PmtEventType } from "../../domain/constants";
import { findTrainingWeekConflicts } from "../../domain/attendance";
import type { PmtEventInput } from "../../hooks/usePmtEvents";
import type { PmtEvent } from "../../domain/types";

interface Props {
  open: boolean;
  onClose: () => void;
  allEvents: PmtEvent[];
  existingEvent?: PmtEvent;
  defaultDate?: string;
  onSave: (input: PmtEventInput) => Promise<void>;
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** This dialog never manages Training Objective linkage (the TO's Calendar screen owns that) -- always preserves whatever objectiveIds an existing event already had. */
export function PmtEventFormDialog({ open, onClose, allEvents, existingEvent, defaultDate, onSave }: Props) {
  const [title, setTitle] = useState(existingEvent?.title ?? "");
  const [eventDate, setEventDate] = useState(toDatetimeLocal(existingEvent?.eventDate) || defaultDate || "");
  const [eventType, setEventType] = useState<PmtEventType>(existingEvent?.eventType ?? "LLAB");
  const [location, setLocation] = useState(existingEvent?.location ?? "");
  const [pocic, setPocic] = useState(existingEvent?.pocic ?? "");
  const [pocic2, setPocic2] = useState(existingEvent?.pocic2 ?? "");
  const [pocic3, setPocic3] = useState(existingEvent?.pocic3 ?? "");
  const [pocsup, setPocsup] = useState(existingEvent?.pocsup ?? "");
  const [trainingWeek, setTrainingWeek] = useState(existingEvent?.trainingWeek?.toString() ?? "");
  const [notes, setNotes] = useState(existingEvent?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const valid = title.trim().length > 0 && eventDate.length > 0;

  /** Flag (never block) a Training Week landing in the same calendar week as a different TW. */
  const conflictWarning = (() => {
    if (trainingWeek.trim() === "" || eventDate.length === 0) return undefined;
    const draft: PmtEvent = {
      id: existingEvent?.id ?? "__draft__",
      title,
      eventDate: new Date(eventDate).toISOString(),
      eventType,
      location,
      pocic,
      pocic2,
      pocic3,
      pocsup,
      trainingWeek: Number(trainingWeek),
      objectiveIds: existingEvent?.objectiveIds ?? [],
      notes,
    };
    const others = allEvents.filter((e) => e.id !== draft.id);
    const conflicts = findTrainingWeekConflicts([...others, draft]);
    return conflicts.find((c) => c.eventIds.includes(draft.id));
  })();

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave({
        title: title.trim(),
        eventDate: new Date(eventDate).toISOString(),
        eventType,
        location,
        pocic,
        pocic2,
        pocic3,
        pocsup,
        trainingWeek: trainingWeek.trim() === "" ? undefined : Number(trainingWeek),
        objectiveIds: existingEvent?.objectiveIds ?? [],
        notes,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existingEvent ? "Edit PMT" : "Add PMT"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. PT Session Week 3" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Date & time *</Label>
              <Input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Type *</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as PmtEventType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PMT_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid gap-1.5">
              <Label>Training week</Label>
              <Input type="number" value={trainingWeek} onChange={(e) => setTrainingWeek(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {conflictWarning && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Training Week {trainingWeek} lands in the same calendar week (of {conflictWarning.calendarWeekOf}) as TW
                {conflictWarning.trainingWeeks.filter((w) => w !== Number(trainingWeek)).join(", ")} on another event. Not blocked, just flagged.
              </span>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>POC-in-charge 1</Label>
            <Input value={pocic} onChange={(e) => setPocic(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid gap-1.5">
            <Label>POC-in-charge 2</Label>
            <Input value={pocic2} onChange={(e) => setPocic2(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid gap-1.5">
            <Label>POC-in-charge 3</Label>
            <Input value={pocic3} onChange={(e) => setPocic3(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid gap-1.5">
            <Label>POC supervisor</Label>
            <Input value={pocsup} onChange={(e) => setPocsup(e.target.value)} placeholder="Optional" />
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!valid || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
