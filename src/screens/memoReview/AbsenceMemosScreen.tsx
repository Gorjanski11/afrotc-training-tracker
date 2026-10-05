import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FileText, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ABSENCE_MEMO_STATUSES, type AbsenceMemoStatus } from "../../domain/constants";
import { canDeleteAbsenceMemo, visibleAbsenceMemos } from "../../domain/access";
import type { AbsenceMemo, Cadet, PmtEvent } from "../../domain/types";
import type { AbsenceMemoInput } from "../../hooks/useAbsenceMemos";

interface Props {
  events: PmtEvent[];
  memos: AbsenceMemo[];
  roster: Cadet[];
  updateMemo: (id: string, input: Partial<AbsenceMemoInput>) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
  applyMemoDecision: (cadetId: string, pmtEventIds: string[], newStatus: "AE" | "A") => Promise<number>;
  reauthenticate: (password: string) => Promise<void>;
  userEmail: string | null | undefined;
  /** Set by a dashboard row click -- opens this specific memo's review popup on mount, then `onConsumeInitialReview` clears it. */
  initialReviewId?: string;
  onConsumeInitialReview?: () => void;
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
export function AbsenceMemosScreen({
  events,
  memos,
  roster,
  updateMemo,
  deleteMemo,
  applyMemoDecision,
  reauthenticate,
  userEmail,
  initialReviewId,
  onConsumeInitialReview,
}: Props) {
  const canDelete = canDeleteAbsenceMemo(userEmail, roster);
  // Section G: true Cadre only see memos concerning them -- Capt Deaton (general reviewer) sees
  // everything, everyone else only their own AS-Class. Cortes Garay/CWL stay unrestricted.
  const visibleMemos = useMemo(() => visibleAbsenceMemos(userEmail, roster, memos), [memos, roster, userEmail]);
  const [reviewingId, setReviewingId] = useState<string | undefined>();
  const [reviewNotes, setReviewNotes] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [deciding, setDeciding] = useState(false);

  const [overrideId, setOverrideId] = useState<string | undefined>();
  const [overrideStatus, setOverrideStatus] = useState<AbsenceMemoStatus>("Pending");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideReturnReason, setOverrideReturnReason] = useState("");
  const [overriding, setOverriding] = useState(false);

  const pendingMemos = useMemo(
    () => visibleMemos.filter((m) => m.status === "Pending").sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)),
    [visibleMemos]
  );
  // Section 9/15: sorted by date reviewed, most recent first, capped to the last 10 -- the full history lives in Memorandums Analytics.
  const decidedMemos = useMemo(
    () =>
      visibleMemos
        .filter((m) => m.status !== "Pending" && m.status !== "Assigned")
        .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))
        .slice(0, 10),
    [visibleMemos]
  );

  useEffect(() => {
    if (!initialReviewId) return;
    const target = memos.find((m) => m.id === initialReviewId);
    if (target) openReview(target);
    onConsumeInitialReview?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReviewId, memos]);

  const openReview = (memo: AbsenceMemo) => {
    setReviewingId(memo.id);
    setReviewNotes("");
    setReturnReason("");
  };

  // Section 2b: cadre can override any memo's status at any time -- shared by the quick-action
  // buttons and the standalone override dialog below, both applying the same PE->AE/A Attendance
  // side-effect whenever the resulting status is Accepted or Rejected.
  const applyDecision = async (memo: AbsenceMemo, status: AbsenceMemoStatus, notes: string, returnReasonText: string | undefined) => {
    const now = new Date().toISOString();
    let attendanceUpdatedAt: string | undefined;
    if ((status === "Accepted" || status === "Rejected") && memo.pmtEventIds.length > 0) {
      await applyMemoDecision(memo.cadetId, memo.pmtEventIds, status === "Accepted" ? "AE" : "A");
      attendanceUpdatedAt = now;
    }
    await updateMemo(memo.id, {
      status,
      reviewedAt: now,
      reviewedBy: OFC_REVIEWER,
      reviewNotes: notes,
      returnReason: status === "Returned" ? returnReasonText : undefined,
      attendanceUpdatedAt,
    });
  };

  const decide = async (memo: AbsenceMemo, decision: "Accepted" | "Rejected" | "Returned") => {
    setDeciding(true);
    try {
      await applyDecision(memo, decision, reviewNotes, returnReason);
      setReviewingId(undefined);
    } finally {
      setDeciding(false);
    }
  };

  const openOverride = (memo: AbsenceMemo) => {
    setOverrideId(memo.id);
    setOverrideStatus(memo.status);
    setOverrideNotes(memo.reviewNotes);
    setOverrideReturnReason(memo.returnReason ?? "");
  };

  const applyOverride = async (memo: AbsenceMemo) => {
    setOverriding(true);
    try {
      // The returned-memo email and the cadet's portal both read `returnReason` specifically, not
      // Notes -- without this, overriding a memo to Returned from a status that was never Returned
      // before would carry over a blank reason (Section: onAbsenceMemoReturned).
      await applyDecision(memo, overrideStatus, overrideNotes || memo.reviewNotes, overrideStatus === "Returned" ? overrideReturnReason : memo.returnReason);
      setOverrideId(undefined);
    } finally {
      setOverriding(false);
    }
  };

  const eventLabel = (id: string) => {
    const e = events.find((ev) => ev.id === id);
    return e ? `${e.eventType} ${new Date(e.eventDate).toLocaleDateString()}` : "deleted PMT";
  };

  const reviewing = memos.find((m) => m.id === reviewingId);
  const overriding_ = memos.find((m) => m.id === overrideId);

  // Permanently deletes an Absence Memo -- restricted to Cortes Garay/Cadre (narrower than who can
  // review), plus a fresh password re-check right before the delete, since this can't be undone.
  const [deleteId, setDeleteId] = useState<string | undefined>();
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const deleting_ = memos.find((m) => m.id === deleteId);

  const openDelete = (memo: AbsenceMemo) => {
    setDeleteId(memo.id);
    setDeletePassword("");
    setDeleteError(undefined);
  };
  const closeDelete = () => {
    setDeleteId(undefined);
    setDeletePassword("");
    setDeleteError(undefined);
  };
  const handleDelete = async () => {
    if (!deleting_ || !deletePassword) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await reauthenticate(deletePassword);
      await deleteMemo(deleting_.id);
      closeDelete();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete -- check your password.");
    } finally {
      setDeleting(false);
    }
  };

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
        <div className="overflow-x-auto">
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
                <TableCell className="flex items-center gap-1.5">
                  <Button size="sm" onClick={() => openReview(m)}>
                    Review
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openOverride(m)} aria-label="Override status">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {canDelete && (
                    <Button size="sm" variant="ghost" title="Delete" onClick={() => openDelete(m)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Decided</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="overflow-x-auto">
            <Table aria-label="Decided absence memos">
              <TableHeader>
                <TableRow>
                  <TableHead>Reviewed</TableHead>
                  <TableHead>Cadet</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PDF</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {decidedMemos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.reviewedAt ? new Date(m.reviewedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{m.cadetName}</TableCell>
                    <TableCell>{m.reviewedBy ?? "—"}</TableCell>
                    <TableCell className="flex items-center gap-1.5">
                      <StatusBadge status={m.status} />
                      {m.lateSubmission && (
                        <Badge variant="destructive" className="text-[10px]">
                          {m.lateSubmission === "dns" ? "DNS" : "Late"}
                        </Badge>
                      )}
                    </TableCell>
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
                    <TableCell className="max-w-xs truncate">{m.status === "Returned" ? m.returnReason : m.reviewNotes}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openOverride(m)} aria-label="Override status">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {canDelete && (
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => openDelete(m)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {decidedMemos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nothing decided yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
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
                      {reviewing.instructor && <> — {reviewing.instructor}</>}
                    </div>
                  )}
                  <div>
                    <strong>Reason:</strong> {reviewing.reason}
                    {reviewing.reason === "Other" && reviewing.reasonOther && <>: {reviewing.reasonOther}</>}
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

      <Dialog open={!!overriding_} onOpenChange={(o) => !o && setOverrideId(undefined)}>
        <DialogContent className="max-w-md">
          {overriding_ && (
            <>
              <DialogHeader>
                <DialogTitle>Override status — {overriding_.cadetName}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={overrideStatus} onValueChange={(v) => setOverrideStatus(v as AbsenceMemoStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ABSENCE_MEMO_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={overrideNotes} onChange={(e) => setOverrideNotes(e.target.value)} placeholder="Optional -- why this was changed" />
                </div>
                {overrideStatus === "Returned" && (
                  <div className="grid gap-1.5">
                    <Label>Return reason</Label>
                    <Textarea value={overrideReturnReason} onChange={(e) => setOverrideReturnReason(e.target.value)} placeholder="What the cadet needs to fix -- sent in the return email and shown on their portal" />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button disabled={overriding} onClick={() => applyOverride(overriding_)}>
                  {overriding ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting_} onOpenChange={(o) => !o && closeDelete()}>
        <DialogContent className="max-w-sm">
          {deleting_ && (
            <>
              <DialogHeader>
                <DialogTitle>Delete absence memo — {deleting_.cadetName}?</DialogTitle>
                <DialogDescription>This permanently deletes it and cannot be undone. Enter your password to confirm.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label>Your password</Label>
                <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
              </div>
              {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              <DialogFooter>
                <Button variant="secondary" onClick={closeDelete} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleting || !deletePassword}>
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
