import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AS_CLASSES, CADET_STATUSES, DEV_LEVELS, FLIGHTS, GMC_DEV_LEVELS, type AsClass, type CadetStatus, type DevLevel, type Flight } from "../domain/constants";
import type { CadetInput } from "../hooks/useCadets";
import type { Cadet } from "../domain/types";

interface Props {
  open: boolean;
  onClose: () => void;
  existingCadet?: Cadet;
  onSave: (input: CadetInput) => Promise<void>;
  /** Restricts the Dev Level picker to one cohort (POC or GMC) -- all four if omitted. */
  allowedDevLevels?: readonly DevLevel[];
}

export function CadetFormDialog({ open, onClose, existingCadet, onSave, allowedDevLevels = DEV_LEVELS }: Props) {
  const [name, setName] = useState(existingCadet?.name ?? "");
  const [asClass, setAsClass] = useState<AsClass | undefined>(existingCadet?.asClass);
  const [devLevel, setDevLevel] = useState<DevLevel | undefined>(existingCadet?.devLevel);
  const [status, setStatus] = useState<CadetStatus>(existingCadet?.status ?? "Active");
  const [notes, setNotes] = useState(existingCadet?.notes ?? "");
  const [email, setEmail] = useState(existingCadet?.email ?? "");
  const [flight, setFlight] = useState<Flight | undefined>(existingCadet?.flight);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isGmc = devLevel ? (GMC_DEV_LEVELS as readonly string[]).includes(devLevel) : false;
  const valid = name.trim().length > 0 && asClass && devLevel && status;

  const handleSave = async () => {
    if (!valid || !asClass || !devLevel) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave({ name: name.trim(), asClass, devLevel, status, notes, email: email.trim(), flight: isGmc ? flight : undefined });
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
          <DialogTitle>{existingCadet ? "Edit Cadet" : "Add Cadet"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Name (Last, First) *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Doe, John" />
          </div>

          <div className="grid gap-1.5">
            <Label>AS Class *</Label>
            <Select value={asClass ?? ""} onValueChange={(v) => setAsClass(v as AsClass)}>
              <SelectTrigger>
                <SelectValue placeholder="Select AS class" />
              </SelectTrigger>
              <SelectContent>
                {AS_CLASSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Dev Level *</Label>
            <Select value={devLevel ?? ""} onValueChange={(v) => setDevLevel(v as DevLevel)}>
              <SelectTrigger>
                <SelectValue placeholder="Select dev level" />
              </SelectTrigger>
              <SelectContent>
                {allowedDevLevels.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {lvl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {isGmc && (
            <div className="grid gap-1.5">
              <Label>Flight</Label>
              <Select value={flight ?? ""} onValueChange={(v) => setFlight(v as Flight)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select flight" />
                </SelectTrigger>
                <SelectContent>
                  {FLIGHTS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
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
