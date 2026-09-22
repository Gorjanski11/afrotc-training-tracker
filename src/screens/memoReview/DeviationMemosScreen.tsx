import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, ExternalLink, UserPlus } from "lucide-react";
import { CadetCombobox } from "../../components/CadetCombobox";
import type { DeviationMemoStatus } from "../../domain/constants";
import type { DeviationMemo, Cadet } from "../../domain/types";
import type { DeviationMemoInput } from "../../hooks/useDeviationMemos";

interface Props {
  roster: Cadet[];
  memos: DeviationMemo[];
  createMemo: (input: DeviationMemoInput) => Promise<DeviationMemo>;
  updateMemo: (id: string, input: Partial<DeviationMemoInput>) => Promise<void>;
}

type Tab = "assign" | "review";

function StatusBadge({ status }: { status: DeviationMemoStatus }) {
  const variant = status === "Accepted" ? "success" : status === "Returned" ? "warning" : status === "Submitted" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function isOverdue(memo: DeviationMemo): boolean {
  return memo.status === "Assigned" && !!memo.dueDate && new Date(memo.dueDate).getTime() < Date.now();
}

export function DeviationMemosScreen({ roster, memos, createMemo, updateMemo }: Props) {
  const [tab, setTab] = useState<Tab>("assign");

  const [cadetId, setCadetId] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | undefined>();

  const [reviewingId, setReviewingId] = useState<string | undefined>();
  const [reviewerName, setReviewerName] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [deciding, setDeciding] = useState(false);

  const assigned = useMemo(
    () => memos.filter((m) => m.status === "Assigned").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [memos]
  );
  const submitted = useMemo(() => memos.filter((m) => m.status === "Submitted").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")), [
    memos,
  ]);
  const decided = useMemo(
    () => memos.filter((m) => m.status === "Accepted" || m.status === "Returned").sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? "")),
    [memos]
  );

  const handleAssign = async () => {
    const person = roster.find((p) => p.id === cadetId);
    if (!person || !reason.trim() || !assignedBy.trim()) return;
    setAssigning(true);
    setAssignError(undefined);
    try {
      await createMemo({
        cadetId: person.id,
        cadetName: person.name,
        assignedBy: assignedBy.trim(),
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
      setCadetId("");
      setReason("");
      setDueDate("");
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

  const reviewing = memos.find((m) => m.id === reviewingId);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" />
          Deviation Memos
        </h2>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="assign">Assign</TabsTrigger>
            <TabsTrigger value="review">
              Submissions & Review
              {submitted.length > 0 && (
                <Badge variant="destructive" className="ml-1.5">
                  {submitted.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "assign" ? (
        <div className="space-y-6">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Assign a Deviation Memo</CardTitle>
              <CardDescription>No Rejected state here -- a deviation memo is always eventually Accepted, or Returned for the cadet to fix and resubmit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Cadet</Label>
                <CadetCombobox cadets={roster} value={cadetId} onChange={setCadetId} className="w-full" />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What the deviation was" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Assigned by</Label>
                  <Input value={assignedBy} onChange={(e) => setAssignedBy(e.target.value)} placeholder="Your name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              {assignError && <p className="text-sm text-destructive">{assignError}</p>}
              <Button onClick={handleAssign} disabled={assigning || !cadetId || !reason.trim() || !assignedBy.trim()}>
                <UserPlus className="h-3.5 w-3.5" />
                {assigning ? "Assigning..." : "Assign"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Awaiting cadet submission</CardTitle>
              <CardDescription>Read-only here -- the cadet submits their PDF on the separate GMC/POC submission site.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Table aria-label="Assigned deviation memos">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cadet</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Assigned by</TableHead>
                    <TableHead>Due</TableHead>
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
                    </TableRow>
                  ))}
                  {assigned.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nothing outstanding.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
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
                    <Button size="sm" onClick={() => openReview(m)}>
                      Review
                    </Button>
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

          <Card>
            <CardHeader>
              <CardTitle>Decided</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <Table aria-label="Decided deviation memos">
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
                  {decided.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.cadetName}</TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                      </TableCell>
                      <TableCell>{m.reviewedAt ? new Date(m.reviewedAt).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>{m.reviewedBy ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate">{m.reviewNotes}</TableCell>
                    </TableRow>
                  ))}
                  {decided.length === 0 && (
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
      )}

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
    </div>
  );
}
