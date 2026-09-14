import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RosterSearchSelect } from "./RosterSearchSelect";
import { PROFICIENCY_CODES, type ProficiencyCode } from "../domain/constants";
import type { CompletionInput } from "../hooks/useCompletions";
import type { Cadet, Completion, TrainingObjective } from "../domain/types";

interface Props {
  open: boolean;
  onClose: () => void;
  cadet: Cadet;
  cadets: Cadet[];
  objective: TrainingObjective;
  requiredProficiency: ProficiencyCode;
  existingCompletion?: Completion;
  onSave: (input: CompletionInput) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CompletionEntryDialog({ open, onClose, cadet, cadets, objective, requiredProficiency, existingCompletion, onSave }: Props) {
  const [proficiency, setProficiency] = useState<ProficiencyCode>(existingCompletion?.proficiencyAchieved ?? requiredProficiency);
  const [dateCompleted, setDateCompleted] = useState(existingCompletion?.dateCompleted?.slice(0, 10) ?? todayIso());
  const [evaluator, setEvaluator] = useState(existingCompletion?.evaluator ?? "");
  const [notes, setNotes] = useState(existingCompletion?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handleSave = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await onSave({
        cadetId: cadet.id,
        cadetName: cadet.name,
        objectiveId: objective.id,
        objectiveNumber: objective.number,
        proficiencyAchieved: proficiency,
        dateCompleted,
        evaluator,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existingCompletion ? "Edit" : "Log"} Training Objective {objective.number} for {cadet.name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm">{objective.title}</p>
        <p className="text-sm text-muted-foreground">
          Required proficiency at {cadet.devLevel}: <strong>{requiredProficiency}</strong>
        </p>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Proficiency achieved *</Label>
            <Select value={proficiency} onValueChange={(v) => setProficiency(v as ProficiencyCode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFICIENCY_CODES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Date completed *</Label>
            <Input type="date" value={dateCompleted} onChange={(e) => setDateCompleted(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>Evaluator</Label>
            <RosterSearchSelect cadets={cadets} value={evaluator} onChange={setEvaluator} placeholder="Optional" />
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
          <Button onClick={handleSave} disabled={saving || !dateCompleted}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
