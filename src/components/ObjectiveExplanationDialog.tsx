import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { TrainingObjective } from "../domain/types";

interface Props {
  open: boolean;
  onClose: () => void;
  objective: TrainingObjective;
}

/** Lightweight quick-view of an objective's full explanation, for mid-task use from Cadet Detail. The Reference Library screen shows the same content inline, unmodaled, organized by PLO section. */
export function ObjectiveExplanationDialog({ open, onClose, objective }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {objective.number} — {objective.title}
            {!objective.graded && <Badge variant="outline">Reference only — not graded</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div>
            <h4 className="mb-1 font-medium">Requirements</h4>
            <p className="whitespace-pre-wrap text-muted-foreground">{objective.requirements || "Not yet transcribed."}</p>
          </div>

          {objective.performanceMeasures.length > 0 && (
            <div>
              <h4 className="mb-1 font-medium">Performance Measures</h4>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                {objective.performanceMeasures.map((pm, i) => (
                  <li key={i}>
                    {pm.text}
                    {pm.optional && <span className="ml-1 italic">(Optional)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {objective.references.length > 0 && (
            <div>
              <h4 className="mb-1 font-medium">References</h4>
              <p className="text-muted-foreground">{objective.references.join("; ")}</p>
            </div>
          )}

          {objective.relatedLessons.length > 0 && (
            <div>
              <h4 className="mb-1 font-medium">Related Lesson/s</h4>
              <p className="text-muted-foreground">{objective.relatedLessons.join("; ")}</p>
            </div>
          )}

          {objective.instructor && (
            <div>
              <h4 className="mb-1 font-medium">Instructor</h4>
              <p className="text-muted-foreground">{objective.instructor}</p>
            </div>
          )}

          {objective.additionalInfo && (
            <div>
              <h4 className="mb-1 font-medium">Additional Information</h4>
              <p className="whitespace-pre-wrap text-muted-foreground">{objective.additionalInfo}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
