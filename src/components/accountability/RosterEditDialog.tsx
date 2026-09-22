import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GROUPS, CADET_STATUSES, type Group, type CadetStatus } from "../../domain/constants";

const NO_GROUP = "__none__";
import type { Cadet } from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";

interface Props {
  open: boolean;
  onClose: () => void;
  person: Cadet;
  onSave: (input: Partial<CadetInput>) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RosterEditDialog({ open, onClose, person, onSave }: Props) {
  const [isCadre, setIsCadre] = useState(person.isCadre);
  const [group, setGroup] = useState<Group | undefined>(person.group);
  const [position, setPosition] = useState(person.position ?? "");
  const [status, setStatus] = useState<CadetStatus>(person.status ?? "Active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSave = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const statusChanged = status !== person.status;
      await onSave({
        isCadre,
        group,
        position: position.trim() === "" ? undefined : position.trim(),
        status,
        statusChangedDate: statusChanged ? todayIso() : person.statusChangedDate,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Accountability fields — {person.name}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Name, AS Class, and Dev Level are managed from the TO's Roster -- this only edits the fields specific to Accountability.
        </p>

        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isCadre} onChange={(e) => setIsCadre(e.target.checked)} />
            Cadre (manual override -- Class becomes "Cadre" regardless of AS Level)
          </label>

          <div className="grid gap-1.5">
            <Label>Group</Label>
            <Select value={group ?? NO_GROUP} onValueChange={(v) => setGroup(v === NO_GROUP ? undefined : (v as Group))}>
              <SelectTrigger>
                <SelectValue placeholder="No group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>No group</SelectItem>
                {GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Position</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Optional -- e.g. CWC, TRG/CTO, OFC" />
          </div>

          <div className="grid gap-1.5">
            <Label>Status *</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CadetStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CADET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
