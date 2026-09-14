import { Fragment, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import type { PmtEvent, TrainingObjective } from "../domain/types";

interface Props {
  open: boolean;
  onClose: () => void;
  event: PmtEvent;
  catalog: TrainingObjective[];
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

export function EventDetailDialog({ open, onClose, event, catalog, onEdit, onDelete }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const objectives = event.objectiveIds.map((id) => catalog.find((o) => o.id === id)).filter((o): o is TrainingObjective => !!o);

  return (
    <Fragment>
      <Dialog open={open && !confirmingDelete} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {event.title}
              <Badge variant="outline">{event.eventType}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 text-sm">
            <div>
              <span className="font-medium">When: </span>
              {new Date(event.eventDate).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
            </div>
            {event.location && (
              <div>
                <span className="font-medium">Location: </span>
                {event.location}
              </div>
            )}
            {(event.pocic || event.pocic2 || event.pocic3) && (
              <div>
                <span className="font-medium">POC-in-charge: </span>
                {[event.pocic, event.pocic2, event.pocic3].filter(Boolean).join(", ")}
              </div>
            )}
            {event.pocsup && (
              <div>
                <span className="font-medium">POC supervisor: </span>
                {event.pocsup}
              </div>
            )}
            {event.trainingWeek !== undefined && (
              <div>
                <span className="font-medium">Training week: </span>
                {event.trainingWeek}
              </div>
            )}
            <div>
              <span className="font-medium">Training Objectives covered: </span>
              {objectives.length === 0 ? (
                <span className="text-muted-foreground">None assigned</span>
              ) : (
                <ul className="mt-1 list-inside list-disc">
                  {objectives.map((objective) => (
                    <li key={objective.id}>
                      {objective.number} — {objective.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {event.notes && (
              <div>
                <span className="font-medium">Notes: </span>
                {event.notes}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
              <Trash2 /> Delete
            </Button>
            <Button onClick={onEdit}>Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmingDelete && (
        <ConfirmDialog
          open
          onClose={() => setConfirmingDelete(false)}
          title={`Delete "${event.title}"?`}
          description="This permanently removes this PMT event from the calendar. This cannot be undone."
          onConfirm={async () => {
            await onDelete();
            onClose();
          }}
        />
      )}
    </Fragment>
  );
}
