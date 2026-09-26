import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
  confirmLabel?: string;
  requirements: React.ReactNode;
}

/** Section 18 -- gates the actual submit behind an acknowledgment checkbox, shown for every memo submission (Absence and Deviation alike). Resets its own checkbox state each time it's reopened. */
export function SubmissionRequirementsDialog({ open, onClose, onConfirm, busy, confirmLabel = "Confirm & Submit", requirements }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Before you submit</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto text-sm text-muted-foreground">{requirements}</div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          <span>I have followed the requirements above.</span>
        </label>
        <DialogFooter>
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!acknowledged || busy}
            onClick={() => {
              setAcknowledged(false);
              onConfirm();
            }}
          >
            {busy ? "Submitting..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
