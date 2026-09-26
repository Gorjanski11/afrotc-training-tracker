import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ClipboardList, Upload, CheckCircle2 } from "lucide-react";
import { SubmissionRequirementsDialog } from "../../components/SubmissionRequirementsDialog";
import { uploadMemoPdf } from "../../lib/storage";
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

function isOverdue(memo: DeviationMemo): boolean {
  return memo.status === "Assigned" && !!memo.dueDate && new Date(memo.dueDate).getTime() < Date.now();
}

export function SubmitDeviationMemoScreen({ cadet, memos, updateMemo }: Props) {
  const cadetId = cadet.id;
  const [submittingId, setSubmittingId] = useState<string | undefined>();
  const [file, setFile] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [confirmingMemo, setConfirmingMemo] = useState<DeviationMemo | undefined>();

  const myAssigned = useMemo(
    () => memos.filter((m) => m.cadetId === cadetId && m.status === "Assigned").sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [memos, cadetId]
  );
  const myReturned = useMemo(
    () => memos.filter((m) => m.cadetId === cadetId && m.status === "Returned").sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? "")),
    [memos, cadetId]
  );
  const mySubmitted = useMemo(
    () =>
      memos
        .filter((m) => m.cadetId === cadetId && m.status !== "Assigned" && m.status !== "Returned")
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "")),
    [memos, cadetId]
  );

  const handleSubmit = async (memo: DeviationMemo) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const uploaded = await uploadMemoPdf(file, "deviationMemos", memo.cadetId);
      await updateMemo(memo.id, {
        pdfUrl: uploaded.url,
        pdfFileName: uploaded.fileName,
        status: "Submitted",
        submittedAt: new Date().toISOString(),
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


  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
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
            <CardTitle>Assigned to you -- needs submission</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Table aria-label="My assigned deviation memos">
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead>Assigned by</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {myAssigned.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-sm">{m.reason}</TableCell>
                    <TableCell>{m.assignedBy}</TableCell>
                    <TableCell className={isOverdue(m) ? "text-destructive" : undefined}>
                      {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}
                      {isOverdue(m) && " (overdue)"}
                    </TableCell>
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
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nothing assigned to you right now.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {myReturned.length > 0 && (
          <Card className="border-warning/50">
            <CardHeader>
              <CardTitle className="text-warning-foreground">Returned -- needs fixing</CardTitle>
              <CardDescription>Cadre sent these back. Attach a corrected PDF and resubmit within 48 hours.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {myReturned.map((m) => (
                <div key={m.id} className="rounded-md border border-input p-3">
                  <div className="mb-1 text-sm font-medium">{m.reason}</div>
                  {m.reviewNotes && <p className="mb-2 text-sm text-muted-foreground">Cadre notes: {m.reviewNotes}</p>}
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
                        {busy ? "Uploading..." : "Resubmit"}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setSubmittingId(m.id)}>
                      <Upload className="h-3.5 w-3.5" />
                      Attach corrected PDF
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {mySubmitted.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Already submitted</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <Table aria-label="My submitted deviation memos">
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mySubmitted.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-sm">{m.reason}</TableCell>
                      <TableCell>{m.status}</TableCell>
                      <TableCell>{m.submittedAt ? new Date(m.submittedAt).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

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
    </div>
  );
}
