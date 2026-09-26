import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Database, Download, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { buildAttendanceSheets } from "../../lib/exportAttendanceData";
import { buildTrainingSheets } from "../../lib/exportTrainingData";
import { buildMemoSheets } from "../../lib/exportMemoData";
import { downloadWorkbook, todayForFilename } from "../../lib/exportWorkbook";
import { listAllMemoPdfs, deleteMemoPdf, type StoredMemoPdf } from "../../lib/storage";
import type { AbsenceMemo, Attendance, Cadet, Completion, DeviationMemo, PmtEvent, TrainingObjective } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  catalog: TrainingObjective[];
  completions: Completion[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
  userEmail: string | null | undefined;
  reauthenticate: (password: string) => Promise<void>;
}

const CORTES_GARAY_EMAIL = "jorge.cortes4@upr.edu";

type ExportCategory = "accountability" | "trainingObjectives" | "memorandums";
const CATEGORIES: { value: ExportCategory; label: string }[] = [
  { value: "accountability", label: "Accountability" },
  { value: "trainingObjectives", label: "Training Objectives" },
  { value: "memorandums", label: "Memorandums" },
];

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function DataManagementScreen({ roster, events, attendance, catalog, completions, absenceMemos, deviationMemos, userEmail, reauthenticate }: Props) {
  const canDelete = (userEmail ?? "").trim().toLowerCase() === CORTES_GARAY_EMAIL;
  const rosterById = new Map(roster.map((p) => [p.id, p]));

  const [selected, setSelected] = useState<Set<ExportCategory>>(new Set(["accountability", "trainingObjectives", "memorandums"]));
  const [exporting, setExporting] = useState(false);

  const [pdfs, setPdfs] = useState<StoredMemoPdf[] | undefined>();
  const [loadingPdfs, setLoadingPdfs] = useState(false);
  const [pdfError, setPdfError] = useState<string | undefined>();

  const [deleteTarget, setDeleteTarget] = useState<StoredMemoPdf | undefined>();
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [deleting, setDeleting] = useState(false);

  const toggleCategory = (category: ExportCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const sheets = [
        ...(selected.has("accountability") ? buildAttendanceSheets(roster, events, attendance) : []),
        ...(selected.has("trainingObjectives") ? buildTrainingSheets(roster, catalog, completions, events) : []),
        ...(selected.has("memorandums") ? buildMemoSheets(absenceMemos, deviationMemos) : []),
      ];
      await downloadWorkbook(`afrotc-export-${todayForFilename()}.xlsx`, sheets);
    } finally {
      setExporting(false);
    }
  };

  const loadPdfs = async () => {
    setLoadingPdfs(true);
    setPdfError(undefined);
    try {
      setPdfs(await listAllMemoPdfs());
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Failed to load PDFs.");
    } finally {
      setLoadingPdfs(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await reauthenticate(deletePassword);
      await deleteMemoPdf(deleteTarget.path);
      setPdfs((prev) => prev?.filter((p) => p.path !== deleteTarget.path));
      setDeleteTarget(undefined);
      setDeletePassword("");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete -- check your password.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <Database className="h-5 w-5 text-primary" />
        Data Management
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Pick which data to include -- everything selected lands in one organized workbook, one sheet per collection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            {CATEGORIES.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.has(c.value)} onChange={() => toggleCategory(c.value)} />
                {c.label}
              </label>
            ))}
          </div>
          <Button onClick={handleExport} disabled={exporting || selected.size === 0}>
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export to Excel"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Submitted PDFs</CardTitle>
            <CardDescription>Every Absence/Deviation Memo PDF in storage -- download or free up space by deleting old ones.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadPdfs} disabled={loadingPdfs}>
            <RefreshCw className="h-3.5 w-3.5" />
            {loadingPdfs ? "Loading..." : pdfs ? "Refresh" : "Load PDFs"}
          </Button>
        </CardHeader>
        <CardContent className="pt-2">
          {pdfError && <p className="mb-2 text-sm text-destructive">{pdfError}</p>}
          {!pdfs ? (
            <p className="text-sm text-muted-foreground">Click "Load PDFs" to list everything in storage.</p>
          ) : (
            <Table aria-label="Stored memo PDFs">
              <TableHeader>
                <TableRow>
                  <TableHead>Cadet</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pdfs.map((p) => (
                  <TableRow key={p.path}>
                    <TableCell>{rosterById.get(p.cadetId)?.name ?? p.cadetId}</TableCell>
                    <TableCell>{p.folder === "absenceMemos" ? "Absence" : "Deviation"}</TableCell>
                    <TableCell>
                      <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                        <ExternalLink className="h-3 w-3" />
                        {p.fileName}
                      </a>
                    </TableCell>
                    <TableCell>{formatSize(p.size)}</TableCell>
                    <TableCell>{new Date(p.uploadedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {pdfs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No PDFs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(undefined);
            setDeletePassword("");
            setDeleteError(undefined);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.fileName}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. Enter your password to confirm.</p>
          <div className="grid gap-1.5">
            <Label>Password</Label>
            <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} autoComplete="current-password" />
          </div>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(undefined)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || !deletePassword}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
