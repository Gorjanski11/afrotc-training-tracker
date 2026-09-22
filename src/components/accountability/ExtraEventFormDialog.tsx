import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EXTRA_EVENT_TYPES, type ExtraEventType } from "../../domain/constants";
import type { ExtraEventInput } from "../../hooks/useExtraEvents";
import type { ExtraEvent, PmtEvent } from "../../domain/types";

interface Props {
  open: boolean;
  onClose: () => void;
  existingEvent?: ExtraEvent;
  pmtEvents: PmtEvent[];
  onSave: (input: ExtraEventInput) => Promise<void>;
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ExtraEventFormDialog({ open, onClose, existingEvent, pmtEvents, onSave }: Props) {
  const [title, setTitle] = useState(existingEvent?.title ?? "");
  const [eventDate, setEventDate] = useState(toDatetimeLocal(existingEvent?.eventDate));
  const [eventType, setEventType] = useState<ExtraEventType>(existingEvent?.eventType ?? "Bonding");
  const [location, setLocation] = useState(existingEvent?.location ?? "");
  const [pocic, setPocic] = useState(existingEvent?.pocic ?? "");
  const [notes, setNotes] = useState(existingEvent?.notes ?? "");
  const [repositionsPmtEventId, setRepositionsPmtEventId] = useState(existingEvent?.repositionsPmtEventId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const valid = title.trim().length > 0 && eventDate.length > 0;

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
        notes,
        repositionsPmtEventId: eventType === "Reposition" && repositionsPmtEventId ? repositionsPmtEventId : undefined,
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
          <DialogTitle>{existingEvent ? "Edit Extra Event" : "Add Extra Event"}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">Never affects accountability -- just a simple attendee list, tracked separately from PMTs.</p>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bowling night" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Date & time *</Label>
              <Input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Type *</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as ExtraEventType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXTRA_EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {eventType === "Reposition" && (
            <div className="grid gap-1.5">
              <Label>Repositions which PMT?</Label>
              <Select value={repositionsPmtEventId} onValueChange={setRepositionsPmtEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select the original PMT" />
                </SelectTrigger>
                <SelectContent>
                  {pmtEvents.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title} — {new Date(e.eventDate).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid gap-1.5">
            <Label>POC-in-charge</Label>
            <Input value={pocic} onChange={(e) => setPocic(e.target.value)} placeholder="Optional" />
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
