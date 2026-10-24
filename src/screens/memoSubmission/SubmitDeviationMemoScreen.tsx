import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, CheckCircle2, ClipboardList } from "lucide-react";
import { SubmissionRequirementsDialog } from "../../components/SubmissionRequirementsDialog";
import { PdfPreview } from "../../components/PdfPreview";
import { uploadMemoPdf } from "../../lib/storage";
import { shortDate, memoStatusVariant } from "../../domain/memoAnalytics";
import { Badge } from "@/components/ui/badge";
import type { DeviationMemo, Cadet } from "../../domain/types";
import type { DeviationMemoInput } from "../../hooks/useDeviationMemos";

interface Props {
  cadet: Cadet;
  memos: DeviationMemo[];
  updateMemo: (id: string, input: Partial<DeviationMemoInput>) => Promise<void>;
}

const REQUIREMENTS_LIST = (
  <ul className="list-disc space-y-2 pl-4">
    <li>The attached PDF must be the actual signed deviation memorandum, not a draft or a photo of a partial document.</li>
    <li>Make sure the reason and any corrective action described match what you discussed with whoever assigned this memo.</li>
    <li className="font-medium text-foreground">Once submitted, this cannot be edited -- if cadre returns it, you'll get a chance to fix and resubmit.</li>
  </ul>
);

// Pure due-date check, not status-gated -- this doubles as the "still actually overdue" signal for
// a Late-status memo too, so it self-corrects back to not-overdue the moment cadre pushes the due
// date into the future, with no need to also flip status back for the display to be accurate.
function isOverdue(memo: DeviationMemo): boolean {
  return !!memo.dueDate && new Date(memo.dueDate).getTime() < Date.now();
}

function reasonDisplay(memo: DeviationMemo): string {
  return memo.reason === "Other" && memo.reasonOther ? `Other: ${memo.reasonOther}` : memo.reason;
}

export function SubmitDeviationMemoScreen({ cadet, memos, updateMemo }: Props) {
  const cadetId = cadet.id;
  const [submittingId, setSubmittingId] = useState<string | undefined>();
  const [file, setFile] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [confirmingMemo, setConfirmingMemo] = useState<DeviationMemo | undefined>();

  // Combining multiple separately-issued "missed your own Absence Memo deadline" memos (e.g. one
  // auto-created for Tuesday's missed PMTs, a second one for Thursday's, created days apart) into
  // one shared PDF submission -- each stays its own record (own due date/history), just gets marked
  // Submitted with the same file. Only offered among memos that trace back to a missed PMT
  // (relatedPmtEventIds set) -- a manually-assigned memo for an unrelated reason never joins in.
  const [combineSelected, setCombineSelected] = useState<Set<string>>(new Set());
  const [combineFile, setCombineFile] = useState<File | undefined>();
  const [combineBusy, setCombineBusy] = useState(false);
  const [combineError, setCombineError] = useState<string | undefined>();
  const [confirmingCombine, setConfirmingCombine] = useState(false);

  // "Late" is still submittable (checkDeviationMemoDeadlines only hides the terminal "Not
  // Submitted", 24h further on) -- it was previously missing here, so any memo that went overdue
  // disappeared from this table entirely and sat unsubmittable under "Already submitted" instead,
  // even after cadre extended its due date.
  const myAssigned = useMemo(
    () =>
      memos
        .filter((m) => m.cadetId === cadetId && (m.status === "Assigned" || m.status === "Late"))
        .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [memos, cadetId]
  );
  const eligibleForCombine = useMemo(() => myAssigned.filter((m) => m.relatedPmtEventIds.length > 0), [myAssigned]);
  const showCombineColumn = eligibleForCombine.length > 1;

  const toggleCombineSelected = (id: string) => {
    setCombineSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const myReturned = useMemo(
    () => memos.filter((m) => m.cadetId === cadetId && m.status === "Returned").sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? "")),
    [memos, cadetId]
  );
  // "Verify Corrections & Submit" opens a dialog previewing cadre's marked-up copy (falling back to
  // the cadet's own last-submitted PDF if cadre didn't draw anything) with the resubmit area inside
  // it, instead of the old plain "Attach corrected PDF" that revealed a bare file input inline.
  const verifyingMemo = myReturned.find((m) => m.id === submittingId);
  const mySubmitted = useMemo(
    () =>
      memos
        .filter((m) => m.cadetId === cadetId && m.status !== "Assigned" && m.status !== "Late" && m.status !== "Returned")
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")),
    [memos, cadetId]
  );

  const handleSubmit = async (memo: DeviationMemo) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const uploaded = await uploadMemoPdf(file, "deviationMemos", memo.cadetId);
      const now = new Date();
      // A Returned memo gives the cadet 48 hours from `reviewedAt` to fix and resubmit (matches the
      // Absence Memo Returned flow) -- past that, it's auto-marked Not Submitted instead of Submitted
      // rather than silently accepting an arbitrarily late resubmission. There's no "Rejected" status
      // on Deviation Memos, so this reuses the existing terminal "Not Submitted" status (same one the
      // original-deadline auto-escalation already uses).
      const deadline = memo.status === "Returned" && memo.reviewedAt ? new Date(new Date(memo.reviewedAt).getTime() + 48 * 3_600_000) : undefined;
      const late = deadline !== undefined && now > deadline;
      await updateMemo(memo.id, {
        pdfUrl: uploaded.url,
        pdfFileName: uploaded.fileName,
        status: late ? "Not Submitted" : "Submitted",
        submittedAt: now.toISOString(),
        ...(late
          ? { reviewedAt: now.toISOString(), reviewedBy: "C/Maj Cortes Garay", reviewNotes: "Automatically marked Not Submitted -- resubmitted after the 48-hour Returned deadline." }
          : {}),
      });
      setSubmittingId(undefined);
      setFile(undefined);
      setJustSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit.");
    } finally {
      setBusy(false);
    }
  };

  // Combine mode is only ever offered among "Assigned"/"Late" memos (eligibleForCombine), never
  // Returned ones -- those already have their own 48-hour resubmit-deadline logic above, which
  // doesn't apply here.
  const handleCombineSubmit = async () => {
    if (!combineFile || combineSelected.size === 0) return;
    setCombineBusy(true);
    setCombineError(undefined);
    try {
      const uploaded = await uploadMemoPdf(combineFile, "deviationMemos", cadetId);
      const now = new Date().toISOString();
      for (const id of combineSelected) {
        await updateMemo(id, { pdfUrl: uploaded.url, pdfFileName: uploaded.fileName, status: "Submitted", submittedAt: now });
      }
      setCombineSelected(new Set());
      setCombineFile(undefined);
      setJustSubmitted(true);
    } catch (e) {
      setCombineError(e instanceof Error ? e.message : "Failed to submit.");
    } finally {
      setCombineBusy(false);
    }
  };

  return (
    <div>
      {/* Phone: this screen's own tab label is icon-only there, so show the title inline instead -- desktop already has it in the tab strip. */}
      <h2 className="mb-4 hidden items-center gap-2 text-xl font-semibold phone:flex">
        <ClipboardList className="h-5 w-5 text-primary" />
        Deviation Memo
      </h2>

      {justSubmitted && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-success/50 bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Submitted. Cadre will review it and let you know if anything needs to be fixed.
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Assigned</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="overflow-x-auto">
            <Table aria-label="My assigned deviation memos">
              <TableHeader>
                <TableRow>
                  {showCombineColumn && <TableHead />}
                  <TableHead>Date Due</TableHead>
                  <TableHead>Reason + Purpose</TableHead>
                  <TableHead>Addressed to</TableHead>
                  <TableHead>CC</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {myAssigned.map((m) => (
                  <TableRow key={m.id}>
                    {showCombineColumn && (
                      <TableCell>
                        {m.relatedPmtEventIds.length > 0 && (
                          <input type="checkbox" checked={combineSelected.has(m.id)} onChange={() => toggleCombineSelected(m.id)} />
                        )}
                      </TableCell>
                    )}
                    <TableCell className={isOverdue(m) ? "whitespace-nowrap text-destructive" : "whitespace-nowrap"}>
                      {shortDate(m.dueDate)}
                      {isOverdue(m) && " (overdue)"}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <div>{reasonDisplay(m)}</div>
                      {m.purpose && <div className="text-xs text-muted-foreground">{m.purpose}</div>}
                    </TableCell>
                    <TableCell>{m.assignedBy}</TableCell>
                    <TableCell>{m.cc.length > 0 ? m.cc.map((c) => c.name).join(", ") : "N/A"}</TableCell>
                    <TableCell>
                      {submittingId === m.id ? (
                        <div className="flex items-center gap-2">
                          {file ? (
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className="max-w-32 truncate">{file.name}</span>
                              <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setFile(undefined)}>
                                Change
                              </Button>
                            </span>
                          ) : (
                            <input
                              type="file"
                              accept="application/pdf"
                              onChange={(e) => setFile(e.target.files?.[0])}
                              className="text-xs text-muted-foreground"
                            />
                          )}
                          <Button size="sm" disabled={!file || busy} onClick={() => setConfirmingMemo(m)}>
                            {busy ? "Uploading..." : "Submit"}
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setSubmittingId(m.id)}>
                          <Upload className="h-3.5 w-3.5" />
                          Submit PDF
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {myAssigned.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showCombineColumn ? 6 : 5} className="text-center text-muted-foreground">
                      Nothing assigned to you right now.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            {showCombineColumn && (
              <div className="mt-3 rounded-md border border-input p-3">
                <p className="mb-2 text-sm text-muted-foreground">
                  Missed the deadline for more than one? Check the ones above that are really the same explanation (e.g. you waited until after
                  Thursday's PMT to submit for Tuesday's) and upload one PDF covering all of them.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {combineFile ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="max-w-32 truncate">{combineFile.name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setCombineFile(undefined)}>
                        Change
                      </Button>
                    </span>
                  ) : (
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setCombineFile(e.target.files?.[0])}
                      className="text-xs text-muted-foreground"
                    />
                  )}
                  <Button
                    size="sm"
                    disabled={combineSelected.size === 0 || !combineFile || combineBusy}
                    onClick={() => setConfirmingCombine(true)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {combineBusy ? "Uploading..." : `Submit combined (${combineSelected.size})`}
                  </Button>
                </div>
                {combineError && <p className="mt-2 text-sm text-destructive">{combineError}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {myReturned.length > 0 && (
          <Card className="border-warning/50">
            <CardHeader>
              <CardTitle className="text-warning">Returned -- needs fixing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {myReturned.map((m) => (
                <div key={m.id} className="rounded-md border border-input p-3">
                  <div className="mb-1 text-sm font-medium">{reasonDisplay(m)}</div>
                  {m.purpose && <p className="mb-1 text-sm text-muted-foreground">{m.purpose}</p>}
                  {m.reviewNotes && <p className="mb-2 text-sm text-muted-foreground">Cadre notes: {m.reviewNotes}</p>}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setFile(undefined);
                      setError(undefined);
                      setSubmittingId(m.id);
                    }}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Verify Corrections & Submit
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {mySubmitted.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Submitted</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="overflow-x-auto">
              <Table aria-label="My submitted deviation memos">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Submitted</TableHead>
                    <TableHead>Reason + Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mySubmitted.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{shortDate(m.submittedAt)}</TableCell>
                      <TableCell className="max-w-sm">
                        <div>{reasonDisplay(m)}</div>
                        {m.purpose && <div className="text-xs text-muted-foreground">{m.purpose}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={memoStatusVariant(m.status)}>{m.status}</Badge>
                      </TableCell>
                      <TableCell>{m.assignedBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!verifyingMemo} onOpenChange={(o) => !o && setSubmittingId(undefined)}>
        <DialogContent className="max-w-4xl">
          {verifyingMemo && (
            <>
              <DialogHeader>
                <DialogTitle>Verify Corrections — {reasonDisplay(verifyingMemo)}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                {verifyingMemo.reviewNotes && (
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Cadre notes:</strong> {verifyingMemo.reviewNotes}
                  </p>
                )}
                <PdfPreview url={verifyingMemo.markupPdfUrl ?? verifyingMemo.pdfUrl ?? ""} />
                <div className="flex items-center gap-2 border-t border-input pt-4">
                  {file ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="max-w-48 truncate">{file.name}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setFile(undefined)}>
                        Change
                      </Button>
                    </span>
                  ) : (
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setFile(e.target.files?.[0])}
                      className="text-xs text-muted-foreground"
                    />
                  )}
                  <Button size="sm" disabled={!file || busy} onClick={() => setConfirmingMemo(verifyingMemo)}>
                    {busy ? "Uploading..." : "Resubmit"}
                  </Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setSubmittingId(undefined)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SubmissionRequirementsDialog
        open={!!confirmingMemo}
        onClose={() => setConfirmingMemo(undefined)}
        busy={busy}
        requirements={REQUIREMENTS_LIST}
        onConfirm={async () => {
          if (confirmingMemo) await handleSubmit(confirmingMemo);
          setConfirmingMemo(undefined);
        }}
      />

      <SubmissionRequirementsDialog
        open={confirmingCombine}
        onClose={() => setConfirmingCombine(false)}
        busy={combineBusy}
        requirements={REQUIREMENTS_LIST}
        onConfirm={async () => {
          await handleCombineSubmit();
          setConfirmingCombine(false);
        }}
      />
    </div>
  );
}
