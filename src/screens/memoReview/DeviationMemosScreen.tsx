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
import { ClipboardList, ExternalLink, UserPlus, Pencil, Trash2 } from "lucide-react";
import { CadetCombobox } from "../../components/CadetCombobox";
import { PersonCombobox } from "../../components/memoReview/PersonCombobox";
import { PersonMultiCombobox } from "../../components/memoReview/PersonMultiCombobox";
import { DEVIATION_MEMO_STATUSES, DEVIATION_REASONS, endOfDay, type DeviationMemoStatus, type DeviationReason } from "../../domain/constants";
import {
  cadetsInAssignScope,
  getAuthorizedDeviationAssigners,
  getCcEligiblePeople,
  isDeviationMemoViaCc,
  isWithinDeviationAssignWindow,
  resolveDeviationAssignRule,
  visibleDeviationMemos,
} from "../../domain/access";
import { formatCadetName } from "../../domain/nameUtils";
import type { DeviationMemo, Cadet, PersonRef } from "../../domain/types";
import type { DeviationMemoInput } from "../../hooks/useDeviationMemos";

interface Props {
  roster: Cadet[];
  memos: DeviationMemo[];
  createMemo: (input: DeviationMemoInput) => Promise<DeviationMemo>;
  updateMemo: (id: string, input: Partial<DeviationMemoInput>) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
  reauthenticate: (password: string) => Promise<void>;
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

function reasonDisplay(memo: DeviationMemo): string {
  return memo.reason === "Other" && memo.reasonOther ? `Other: ${memo.reasonOther}` : memo.reason;
}

/** Section 9 -- single view (no more Assign/Submissions-&-Review tabs): Submitted, then Awaiting submission, then Processed, top to bottom. Assign lives in a popup instead of its own tab. */
export function DeviationMemosScreen({ roster, memos, createMemo, updateMemo, deleteMemo, reauthenticate, userEmail: userEmailRaw }: Props) {
  const userEmail = userEmailRaw ?? "";
  const rule = useMemo(() => resolveDeviationAssignRule(userEmail, roster), [userEmail, roster]);

  const assignTargets = useMemo(() => cadetsInAssignScope(rule.assignScope, roster), [rule, roster]);
  // Checked once per render, not on a ticking clock -- matches how every other "now" check in this
  // app is handled (no live timer), accepted as good enough for a business-hours gate.
  const withinAssignWindow = isWithinDeviationAssignWindow();
  const authorizedAssigners = useMemo(() => getAuthorizedDeviationAssigners(roster), [roster]);
  const ccEligible = useMemo(() => getCcEligiblePeople(roster), [roster]);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [cadetId, setCadetId] = useState("");
  const me = roster.find((p) => p.email?.trim().toLowerCase() === userEmail.trim().toLowerCase());
  const [assignedByEmail, setAssignedByEmail] = useState(me?.email ?? "");
  const [assignedByName, setAssignedByName] = useState(me ? formatCadetName(me) : "");
  const [cc, setCc] = useState<PersonRef[]>([]);
  const [reason, setReason] = useState<DeviationReason | "">("");
  const [reasonOther, setReasonOther] = useState("");
  const [purpose, setPurpose] = useState("");
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
  // or were CC'd on (view only) -- everyone else (Cortes Garay) sees everything.
  const visibleMemos = useMemo(() => visibleDeviationMemos(userEmail, roster, memos), [memos, roster, userEmail]);

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
    setReasonOther("");
    setPurpose("");
    setDueDate("");
    setCc([]);
  };

  // SOP (1 Oct 2026) Section 5a: a deviation memo must give the cadet a minimum of 48 hours to
  // submit it, no maximum. The earliest valid calendar date is whichever day end-of-day (23:59:59,
  // via `endOfDay`) lands at or after now+48h -- that's always the calendar date of now+48h itself,
  // since that date's own end-of-day is necessarily later than that exact moment.
  const minDueDate = useMemo(() => {
    const d = new Date(Date.now() + 48 * 3_600_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const assignValid =
    !!cadetId && !!reason && (reason !== "Other" || !!reasonOther.trim()) && !!purpose.trim() && !!assignedByEmail && !!dueDate && dueDate >= minDueDate;

  const handleAssign = async () => {
    const person = roster.find((p) => p.id === cadetId);
    if (!person || !assignValid) return;
    if (!isWithinDeviationAssignWindow()) {
      setAssignError("Deviation Memos can only be assigned Monday-Friday, 0400-2000.");
      return;
    }
    setAssigning(true);
    setAssignError(undefined);
    try {
      await createMemo({
        cadetId: person.id,
        cadetName: formatCadetName(person),
        assignedBy: assignedByName,
        assignedByEmail,
        cc,
        reason,
        reasonOther: reason === "Other" ? reasonOther.trim() : undefined,
        purpose: purpose.trim(),
        relatedPmtEventId: undefined,
        dateAssigned: new Date().toISOString(),
        dueDate: dueDate ? endOfDay(dueDate).toISOString() : undefined,
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
    // Whoever assigned the memo is almost always the one reviewing it (reviewOwnOnly already
    // restricts the Review button to them) -- default the box to their name instead of blank.
    setReviewerName(memo.assignedBy);
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
    setOverrideNotes(memo.reviewNotes);
  };

  const applyOverride = async (memo: DeviationMemo) => {
    setOverriding(true);
    try {
      await updateMemo(memo.id, {
        status: overrideStatus,
        reviewedAt: new Date().toISOString(),
        reviewedBy: me ? formatCadetName(me) : userEmail,
        reviewNotes: overrideNotes || memo.reviewNotes,
      });
      setOverrideId(undefined);
    } finally {
      setOverriding(false);
    }
  };

  const reviewing = memos.find((m) => m.id === reviewingId);
  const overriding_ = memos.find((m) => m.id === overrideId);

  // "Just in case" safety valve, requested explicitly -- permanently deletes a Deviation Memo,
  // regardless of its current status. Gated to whoever can already review it (same as override),
  // plus a fresh password re-check right before the delete, since this can't be undone.
  const [revokeId, setRevokeId] = useState<string | undefined>();
  const [revokePassword, setRevokePassword] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | undefined>();
  const revoking_ = memos.find((m) => m.id === revokeId);

  const openRevoke = (memo: DeviationMemo) => {
    setRevokeId(memo.id);
    setRevokePassword("");
    setRevokeError(undefined);
  };
  const closeRevoke = () => {
    setRevokeId(undefined);
    setRevokePassword("");
    setRevokeError(undefined);
  };
  const handleRevoke = async () => {
    if (!revoking_ || !revokePassword) return;
    setRevoking(true);
    setRevokeError(undefined);
    try {
      await reauthenticate(revokePassword);
      await deleteMemo(revoking_.id);
      closeRevoke();
    } catch (e) {
      setRevokeError(e instanceof Error ? e.message : "Failed to revoke -- check your password.");
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" />
          Deviation Memos
        </h2>
        {rule.canAssign &&
          (withinAssignWindow ? (
            <Button onClick={() => setAssignDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Assign
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Assigning is only available Monday-Friday, 0400-2000.</p>
          ))}
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
            <div className="overflow-x-auto">
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
                    <TableCell>
                      {m.cadetName}
                      {isDeviationMemoViaCc(userEmail, m) && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          CC'd
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{reasonDisplay(m)}</TableCell>
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
                        <div className="flex items-center gap-1">
                          <Button size="sm" onClick={() => openReview(m)}>
                            Review
                          </Button>
                          <Button size="sm" variant="ghost" title="Revoke" onClick={() => openRevoke(m)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Awaiting submission</CardTitle>
            <CardDescription>Read-only here -- the cadet submits their PDF from the Memo Submission tab.</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="overflow-x-auto">
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
                    <TableCell>
                      {m.cadetName}
                      {isDeviationMemoViaCc(userEmail, m) && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          CC'd
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{reasonDisplay(m)}</TableCell>
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
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openOverride(m)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Revoke" onClick={() => openRevoke(m)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processed</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="overflow-x-auto">
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
                    <TableCell>
                      {m.cadetName}
                      {isDeviationMemoViaCc(userEmail, m) && (
                        <Badge variant="outline" className="ml-1.5 text-[10px]">
                          CC'd
                        </Badge>
                      )}
                    </TableCell>
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
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openOverride(m)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Revoke" onClick={() => openRevoke(m)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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
            </div>
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
              <Label>Reason (the observation made)</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as DeviationReason)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {DEVIATION_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reason === "Other" && (
                <Input value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} placeholder="Describe the reason" className="mt-1.5" />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What do you want this memorandum to explain or address?" />
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
                <Input type="date" value={dueDate} min={minDueDate} onChange={(e) => setDueDate(e.target.value)} />
                <p className="text-xs text-muted-foreground">Minimum 48 hours from now -- no maximum.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>CC</Label>
              <PersonMultiCombobox people={ccEligible} value={cc} onChange={setCc} />
            </div>
            {assignError && <p className="text-sm text-destructive">{assignError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assigning || !assignValid || !withinAssignWindow}>
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
                    <strong>Reason:</strong> {reasonDisplay(reviewing)}
                  </div>
                  {reviewing.purpose && (
                    <div>
                      <strong>Purpose:</strong> {reviewing.purpose}
                    </div>
                  )}
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

      <Dialog open={!!revoking_} onOpenChange={(o) => !o && closeRevoke()}>
        <DialogContent className="max-w-sm">
          {revoking_ && (
            <>
              <DialogHeader>
                <DialogTitle>Revoke deviation memo — {revoking_.cadetName}?</DialogTitle>
                <DialogDescription>This permanently deletes it and cannot be undone. Enter your password to confirm.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label>Your password</Label>
                <Input
                  type="password"
                  value={revokePassword}
                  onChange={(e) => setRevokePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {revokeError && <p className="text-sm text-destructive">{revokeError}</p>}
              <DialogFooter>
                <Button variant="secondary" onClick={closeRevoke} disabled={revoking}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleRevoke} disabled={revoking || !revokePassword}>
                  {revoking ? "Revoking..." : "Revoke"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
