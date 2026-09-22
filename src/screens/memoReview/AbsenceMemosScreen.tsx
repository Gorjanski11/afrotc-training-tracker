import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, ExternalLink } from "lucide-react";
import type { AbsenceMemoStatus } from "../../domain/constants";
import type { AbsenceMemo, PmtEvent } from "../../domain/types";
import type { AbsenceMemoInput } from "../../hooks/useAbsenceMemos";

interface Props {
  events: PmtEvent[];
  memos: AbsenceMemo[];
  updateMemo: (id: string, input: Partial<AbsenceMemoInput>) => Promise<void>;
  applyMemoDecision: (cadetId: string, pmtEventIds: string[], newStatus: "AE" | "A") => Promise<number>;
}

function StatusBadge({ status }: { status: AbsenceMemoStatus }) {
  const variant = status === "Accepted" ? "success" : status === "Rejected" ? "destructive" : status === "Returned" ? "warning" : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

/** What this memo is actually for -- a PMT absence, an AS-Class absence, or (rarely) both. */
function coverageSummary(m: AbsenceMemo, eventLabel: (id: string) => string): string {
  const parts: string[] = [];
  if (m.pmtEventIds.length > 0) parts.push(m.pmtEventIds.map(eventLabel).join(", "));
  if (m.asClass) parts.push(`${m.asClass} class (${m.classDate ? new Date(m.classDate).toLocaleDateString() : "no date"})`);
  return parts.join(" + ") || "—";
}

// Only OFC reviews Absence Memos -- there's no other reviewer to pick, so this is fixed rather than a free-text field.
const OFC_REVIEWER = "Capt Deaton";

/** Submission now lives on the separate GMC/POC submission site -- this screen is cadre review only. */
export function AbsenceMemosScreen({ events, memos, updateMemo, applyMemoDecision }: Props) {
  const [reviewingId, setReviewingId] = useState<string | undefined>();
  const [reviewNotes, setReviewNotes] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [deciding, setDeciding] = useState(false);

  const pendingMemos = useMemo(() => memos.filter((m) => m.status === "Pending").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)), [memos]);
  const decidedMemos = useMemo(() => memos.filter((m) => m.status !== "Pending" && m.status !== "Assigned").sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [memos]);

  const openReview = (memo: AbsenceMemo) => {
    setReviewingId(memo.id);
    setReviewNotes("");
    setReturnReason("");
  };

  const decide = async (memo: AbsenceMemo, decision: "Accepted" | "Rejected" | "Returned") => {
    setDeciding(true);
    try {
      const now = new Date().toISOString();
      let attendanceUpdatedAt: string | undefined;
      if ((decision === "Accepted" || decision === "Rejected") && memo.pmtEventIds.length > 0) {
        await applyMemoDecision(memo.cadetId, memo.pmtEventIds, decision === "Accepted" ? "AE" : "A");
        attendanceUpdatedAt = now;
      }
      await updateMemo(memo.id, {
        status: decision,
        reviewedAt: now,
        reviewedBy: OFC_REVIEWER,
        reviewNotes,
        returnReason: decision === "Returned" ? returnReason : undefined,
        attendanceUpdatedAt,
      });
      setReviewingId(undefined);
    } finally {
      setDeciding(false);
    }
  };

  const eventLabel = (id: string) => {
    const e = events.find((ev) => ev.id === id);
    return e ? `${e.eventType} ${new Date(e.eventDate).toLocaleDateString()}` : "deleted PMT";
  };

  const reviewing = memos.find((m) => m.id === reviewingId);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <FileText className="h-5 w-5 text-primary" />
          Absence Memos
        </h2>
        {pendingMemos.length > 0 && <Badge variant="destructive">{pendingMemos.length} pending</Badge>}
      </div>

      <div className="space-y-6">
        <Table aria-label="Pending absence memos">
          <TableHeader>
            <TableRow>
              <TableHead>Submitted</TableHead>
              <TableHead>Cadet</TableHead>
              <TableHead>Covers</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>PDF</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingMemos.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{new Date(m.submittedAt).toLocaleDateString()}</TableCell>
                <TableCell>{m.cadetName}</TableCell>
                <TableCell className="max-w-xs truncate" title={coverageSummary(m, eventLabel)}>
                  {coverageSummary(m, eventLabel)}
                </TableCell>
                <TableCell>{m.reason}</TableCell>
                <TableCell>
                  {m.pdfUrl ? (
                    <a href={m.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                      <ExternalLink className="h-3 w-3" />
                      {m.pdfFileName}
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => openReview(m)}>
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {pendingMemos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nothing pending.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Card>
          <CardHeader>
            <CardTitle>Decided</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Table aria-label="Decided absence memos">
              <TableHeader>
                <TableRow>
                  <TableHead>Cadet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decidedMemos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.cadetName}</TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell>{m.reviewedAt ? new Date(m.reviewedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{m.reviewedBy ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{m.status === "Returned" ? m.returnReason : m.reviewNotes}</TableCell>
                  </TableRow>
                ))}
                {decidedMemos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nothing decided yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewingId(undefined)}>
        <DialogContent className="max-w-lg">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle>Review — {reviewing.cadetName}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="text-sm text-muted-foreground">
                  {reviewing.pmtEventIds.length > 0 && (
                    <div>
                      <strong>PMTs:</strong> {reviewing.pmtEventIds.map(eventLabel).join(", ")}
                    </div>
                  )}
                  {reviewing.asClass && (
                    <div>
                      <strong>AS Class:</strong> {reviewing.asClass} — {reviewing.classDate ? new Date(reviewing.classDate).toLocaleDateString() : "no date"}
                      {reviewing.classTitle && <> — "{reviewing.classTitle}"</>}
                      {reviewing.instructor && <> — {reviewing.instructor}</>}
                    </div>
                  )}
                  <div>
                    <strong>Reason:</strong> {reviewing.reason}
                    {reviewing.medicalDocSent && " (medical documentation sent separately)"}
                  </div>
                  {reviewing.pdfUrl && (
                    <a href={reviewing.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                      <ExternalLink className="h-3 w-3" />
                      View memo PDF
                    </a>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Reviewing as: <strong>{OFC_REVIEWER}</strong>
                </div>
                <div className="grid gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Optional" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Return reason (if returning)</Label>
                  <Textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="What the cadet needs to fix" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" disabled={deciding} onClick={() => decide(reviewing, "Returned")}>
                  Return
                </Button>
                <Button variant="destructive" disabled={deciding} onClick={() => decide(reviewing, "Rejected")}>
                  Reject
                </Button>
                <Button disabled={deciding} onClick={() => decide(reviewing, "Accepted")}>
                  Accept
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
