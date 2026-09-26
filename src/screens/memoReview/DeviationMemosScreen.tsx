import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ClipboardList, ExternalLink, UserPlus, Pencil } from "lucide-react";
import { CadetCombobox } from "../../components/CadetCombobox";
import { PersonCombobox } from "../../components/memoReview/PersonCombobox";
import { PersonMultiCombobox } from "../../components/memoReview/PersonMultiCombobox";
import { DEVIATION_MEMO_STATUSES, type DeviationMemoStatus } from "../../domain/constants";
import { cadetsInAssignScope, getAuthorizedDeviationAssigners, getCcEligiblePeople, resolveDeviationAssignRule } from "../../domain/access";
import type { DeviationMemo, Cadet, PersonRef } from "../../domain/types";
import type { DeviationMemoInput } from "../../hooks/useDeviationMemos";

interface Props {
  roster: Cadet[];
  memos: DeviationMemo[];
  createMemo: (input: DeviationMemoInput) => Promise<DeviationMemo>;
  updateMemo: (id: string, input: Partial<DeviationMemoInput>) => Promise<void>;
  userEmail: string | null | undefined;
}

function StatusBadge({ status }: { status: DeviationMemoStatus }) {
  const variant =
    status === "Accepted"
      ? "success"
      : status === "Returned"
        ? "warning"
        : status === "Submitted"
          ? "secondary"
          : status === "Late"
            ? "destructive"
            : status === "Not Submitted"
              ? "destructive"
              : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function isOverdue(memo: DeviationMemo): boolean {
  return (memo.status === "Assigned" || memo.status === "Late") && !!memo.dueDate && new Date(memo.dueDate).getTime() < Date.now();
}

/** Section 9 -- single view (no more Assign/Submissions-&-Review tabs): Submitted, then Awaiting submission, then Processed, top to bottom. Assign lives in a popup instead of its own tab. */
export function DeviationMemosScreen({ roster, memos, createMemo, updateMemo, userEmail: userEmailRaw }: Props) {
  const userEmail = userEmailRaw ?? "";
  const rule = useMemo(() => resolveDeviationAssignRule(userEmail, roster), [userEmail, roster]);

  const assignTargets = useMemo(() => cadetsInAssignScope(rule.assignScope, roster), [rule, roster]);
  const authorizedAssigners = useMemo(() => getAuthorizedDeviationAssigners(roster), [roster]);
  const ccEligible = useMemo(() => getCcEligiblePeople(roster), [roster]);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [cadetId, setCadetId] = useState("");
  const me = roster.find((p) => p.email?.trim().toLowerCase() === userEmail.trim().toLowerCase());
  const [assignedByEmail, setAssignedByEmail] = useState(me?.email ?? "");
  const [assignedByName, setAssignedByName] = useState(me?.name ?? "");
  const [cc, setCc] = useState<PersonRef[]>([]);
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | undefined>();

  const [reviewingId, setReviewingId] = useState<string | undefined>();
  const [reviewerName, setReviewerName] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [deciding, setDeciding] = useState(false);

  const [overrideId, setOverrideId] = useState<string | undefined>();
  const [overrideStatus, setOverrideStatus] = useState<DeviationMemoStatus>("Assigned");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overriding, setOverriding] = useState(false);

  // Section 7: a reviewOwnOnly viewer only ever sees memos they personally assigned (full review)
  // or were CC'd on (view only) -- everyone else (Cadre/Cortes Garay) sees everything.
  const visibleMemos = useMemo(() => {
    if (!rule.reviewOwnOnly) return memos;
    const email = userEmail.trim().toLowerCase();
    return memos.filter((m) => m.assignedByEmail?.trim().toLowerCase() === email || m.cc.some((c) => c.email.trim().toLowerCase() === email));
  }, [memos, rule.reviewOwnOnly, userEmail]);

  const canReview = (m: DeviationMemo) => !rule.reviewOwnOnly || m.assignedByEmail?.trim().toLowerCase() === userEmail.trim().toLowerCase();

  const submitted = useMemo(
    () => visibleMemos.filter((m) => m.status === "Submitted").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")),
    [visibleMemos]
  );
  const assigned = useMemo(
    () => visibleMemos.filter((m) => m.status === "Assigned" || m.status === "Late").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [visibleMemos]
  );
  // Section 9/15: sorted by date reviewed, most recent first, capped to the last 10 -- the full history lives in Memorandums Analytics.
  const processed = useMemo(
    () =>
      visibleMemos
        .filter((m) => m.status === "Accepted" || m.status === "Returned" || m.status === "Not Submitted")
        .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""))
        .slice(0, 10),
    [visibleMemos]
  );

  const resetAssignForm = () => {
    setCadetId("");
    setReason("");
    setDueDate("");
    setCc([]);
  };

  const handleAssign = async () => {
    const person = roster.find((p) => p.id === cadetId);
    if (!person || !reason.trim() || !assignedByEmail) return;
    setAssigning(true);
    setAssignError(undefined);
    try {
      await createMemo({
        cadetId: person.id,
        cadetName: person.name,
        assignedBy: assignedByName,
        assignedByEmail,
        cc,
        reason: reason.trim(),
        dateAssigned: new Date().toISOString(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        status: "Assigned",
        pdfUrl: undefined,
        pdfFileName: undefined,
        submittedAt: undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
        reviewNotes: "",
      });
      resetAssignForm();
      setAssignDialogOpen(false);
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Failed to assign.");
    } finally {
      setAssigning(false);
    }
  };

  const openReview = (memo: DeviationMemo) => {
    setReviewingId(memo.id);
    setReviewerName("");
    setReviewNotes("");
  };

  const decide = async (memo: DeviationMemo, decision: "Accepted" | "Returned") => {
    setDeciding(true);
    try {
      await updateMemo(memo.id, {
        status: decision,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerName.trim() || undefined,
        reviewNotes,
      });
      setReviewingId(undefined);
    } finally {
      setDeciding(false);
    }
  };

  // Section 2b: cadre can override any memo's status at any time, not just from the Pending/Assigned
  // quick-action flow -- no status here is truly final.
  const openOverride = (memo: DeviationMemo) => {
    setOverrideId(memo.id);
    setOverrideStatus(memo.status);
    setOverrideNotes("");
  };

  const applyOverride = async (memo: DeviationMemo) => {
    setOverriding(true);
    try {
      await updateMemo(memo.id, {
        status: overrideStatus,
        reviewedAt: new Date().toISOString(),
        reviewedBy: me?.name ?? userEmail,
        reviewNotes: overrideNotes || memo.reviewNotes,
      });
      setOverrideId(undefined);
    } finally {
      setOverriding(false);
    }
  };

  const reviewing = memos.find((m) => m.id === reviewingId);
  const overriding_ = memos.find((m) => m.id === overrideId);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" />
          Deviation Memos
        </h2>
        {rule.canAssign && (
          <Button onClick={() => setAssignDialogOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" />
            Assign
          </Button>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Submitted
              {submitted.length > 0 && (
                <Badge variant="destructive" className="ml-1.5">
                  {submitted.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Awaiting your review.</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Table aria-label="Submitted deviation memos">
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Cadet</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>PDF</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {submitted.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.submittedAt ? new Date(m.submittedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{m.cadetName}</TableCell>
                    <TableCell className="max-w-xs truncate">{m.reason}</TableCell>
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
                      {canReview(m) ? (
                        <Button size="sm" onClick={() => openReview(m)}>
                          Review
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">View only (CC'd)</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {submitted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nothing awaiting review.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Awaiting submission</CardTitle>
            <CardDescription>Read-only here -- the cadet submits their PDF from the Memo Submission tab.</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Table aria-label="Assigned deviation memos">
              <TableHeader>
                <TableRow>
                  <TableHead>Cadet</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Assigned by</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assigned.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.cadetName}</TableCell>
                    <TableCell className="max-w-xs truncate">{m.reason}</TableCell>
                    <TableCell>{m.assignedBy}</TableCell>
                    <TableCell className={isOverdue(m) ? "text-destructive" : undefined}>
                      {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}
                      {isOverdue(m) && " (overdue)"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell>
                      {canReview(m) && (
                        <Button size="sm" variant="ghost" onClick={() => openOverride(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {assigned.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nothing outstanding.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processed</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Table aria-label="Processed deviation memos">
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
                {processed.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.reviewedAt ? new Date(m.reviewedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>{m.cadetName}</TableCell>
                    <TableCell>{m.reviewedBy ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
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
                    <TableCell className="max-w-xs truncate">{m.reviewNotes}</TableCell>
                    <TableCell>
                      {canReview(m) && (
                        <Button size="sm" variant="ghost" onClick={() => openOverride(m)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {processed.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nothing processed yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={assignDialogOpen} onOpenChange={(o) => !o && setAssignDialogOpen(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign a Deviation Memo</DialogTitle>
            <DialogDescription>No Rejected state here -- a deviation memo is always eventually Accepted, or Returned for the cadet to fix and resubmit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cadet</Label>
              <CadetCombobox cadets={assignTargets} value={cadetId} onChange={setCadetId} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What the deviation was" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Assigned by</Label>
                <PersonCombobox
                  people={authorizedAssigners}
                  value={assignedByEmail}
                  onChange={(email, name) => {
                    setAssignedByEmail(email);
                    setAssignedByName(name);
                  }}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>CC (can view, not review -- POC or Cadre only)</Label>
              <PersonMultiCombobox people={ccEligible} value={cc} onChange={setCc} />
            </div>
            {assignError && <p className="text-sm text-destructive">{assignError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assigning || !cadetId || !reason.trim() || !assignedByEmail}>
              {assigning ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewingId(undefined)}>
        <DialogContent className="max-w-lg">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle>Review — {reviewing.cadetName}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="text-sm text-muted-foreground">
                  <div>
                    <strong>Reason:</strong> {reviewing.reason}
                  </div>
                  {reviewing.pdfUrl && (
                    <a href={reviewing.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                      <ExternalLink className="h-3 w-3" />
                      View submitted PDF
                    </a>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label>Your name</Label>
                  <Input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="Who's reviewing this" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Notes</Label>
                  <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Optional -- required context if returning" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" disabled={deciding} onClick={() => decide(reviewing, "Returned")}>
                  Return
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
                  <Select value={overrideStatus} onValueChange={(v) => setOverrideStatus(v as DeviationMemoStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVIATION_MEMO_STATUSES.map((s) => (
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
    </div>
  );
}
