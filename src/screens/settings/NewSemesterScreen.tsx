import { useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Upload, Download, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { AS_CLASSES, DEV_LEVELS, FLIGHTS, GROUPS, PMT_EVENT_TYPES } from "../../domain/constants";
import { isCadreOrCortesGaray } from "../../domain/access";
import {
  CADET_ROSTER_COLUMNS,
  CADRE_ROSTER_COLUMNS,
  EVENTS_COLUMNS,
  buildCadetRosterDiff,
  buildCadreRosterDiff,
  buildEventsPlan,
  revalidateCadetDiffRow,
  revalidateCadreDiffRow,
  revalidateEventRow,
  cadetDiffRowToInput,
  eventRowToInput,
  type CadetDiffRow,
  type CadreDiffRow,
  type EventPlanRow,
} from "../../domain/newSemester";
import { buildAttendanceSheets } from "../../lib/exportAttendanceData";
import { buildTrainingSheets } from "../../lib/exportTrainingData";
import { buildMemoSheets } from "../../lib/exportMemoData";
import { downloadWorkbook, todayForFilename } from "../../lib/exportWorkbook";
import { downloadMemoPdfZip } from "../../lib/exportZip";
import { deleteAllInCollection } from "../../lib/firestoreBulk";
import { listAllMemoPdfs, deleteMemoPdf } from "../../lib/storage";
import type { AbsenceMemo, Attendance, Cadet, Completion, DeviationMemo, PmtEvent, TrainingObjective } from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";
import type { PmtEventInput } from "../../hooks/usePmtEvents";
import type { AccountOpResult } from "../../hooks/useAuth";

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
  createCadet: (input: CadetInput) => Promise<Cadet>;
  updateCadet: (id: string, input: CadetInput) => Promise<Cadet>;
  updateCadetFields: (id: string, input: Partial<CadetInput>) => Promise<void>;
  deleteCadet: (id: string) => Promise<void>;
  createEvent: (input: PmtEventInput) => Promise<PmtEvent>;
  createCadetAccounts: (emails: string[]) => Promise<AccountOpResult[]>;
  disableCadetAccounts: (emails: string[]) => Promise<AccountOpResult[]>;
  refetchAll: () => Promise<void>;
}

type Step = "upload" | "review" | "acknowledge" | "running" | "done";

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function FileUploadRow({
  label,
  columns,
  templateFilename,
  file,
  onFile,
}: {
  label: string;
  columns: string[];
  templateFilename: string;
  file: File | undefined;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-input p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{file ? file.name : "No file selected."}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadTextFile(templateFilename, columns.join("\t") + "\n")}
        >
          <Download className="h-3.5 w-3.5" />
          Template
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          {file ? "Change file" : "Upload file"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.tsv,text/plain,text/tab-separated-values"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function FlagList({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {flags.map((f, i) => (
        <li key={i} className="flex items-start gap-1 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {f}
        </li>
      ))}
    </ul>
  );
}

const ACTION_BADGE: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  create: "success",
  update: "warning",
  delete: "destructive",
  missing: "secondary",
};

/**
 * Section 6.3 -- gated to Cadre or Cortes Garay (it can wipe/recreate the entire roster, calendar,
 * and every cadet's login access). Flow: upload 3 tab-delimited files -> editable review (diff against
 * the live roster, flagged problems highlighted, fixable inline) -> export everything as a backup
 * (Excel workbook + a zip of every memo PDF) with an explicit acknowledgement -> the actual wipe and
 * import, logged step by step.
 */
export function NewSemesterScreen({
  roster,
  events,
  attendance,
  catalog,
  completions,
  absenceMemos,
  deviationMemos,
  userEmail,
  reauthenticate,
  createCadet,
  updateCadet,
  updateCadetFields,
  deleteCadet,
  createEvent,
  createCadetAccounts,
  disableCadetAccounts,
  refetchAll,
}: Props) {
  const authorized = isCadreOrCortesGaray(userEmail, roster);

  const [step, setStep] = useState<Step>("upload");
  const [cadetFile, setCadetFile] = useState<File | undefined>();
  const [cadreFile, setCadreFile] = useState<File | undefined>();
  const [eventsFile, setEventsFile] = useState<File | undefined>();
  const [parseError, setParseError] = useState<string | undefined>();
  const [parsing, setParsing] = useState(false);

  const [cadetDiff, setCadetDiff] = useState<CadetDiffRow[]>([]);
  const [cadreDiff, setCadreDiff] = useState<CadreDiffRow[]>([]);
  const [eventsPlan, setEventsPlan] = useState<EventPlanRow[]>([]);

  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | undefined>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [password, setPassword] = useState("");

  const [log, setLog] = useState<string[]>([]);
  const [runError, setRunError] = useState<string | undefined>();

  if (!authorized) {
    return (
      <div>
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
          <CalendarPlus className="h-5 w-5 text-primary" />
          New Semester
        </h2>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Only Cadre or Cortes Garay can run the New Semester reset.</CardContent>
        </Card>
      </div>
    );
  }

  const appendLog = (line: string) => setLog((prev) => [...prev, line]);

  const handleParse = async () => {
    if (!cadetFile || !cadreFile || !eventsFile) return;
    setParsing(true);
    setParseError(undefined);
    try {
      const [cadetText, cadreText, eventsText] = await Promise.all([readFileAsText(cadetFile), readFileAsText(cadreFile), readFileAsText(eventsFile)]);
      setCadetDiff(buildCadetRosterDiff(cadetText, roster));
      setCadreDiff(buildCadreRosterDiff(cadreText, roster));
      setEventsPlan(buildEventsPlan(eventsText, catalog));
      setStep("review");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to read one of the files.");
    } finally {
      setParsing(false);
    }
  };

  const cadetCounts = {
    create: cadetDiff.filter((r) => r.action === "create").length,
    update: cadetDiff.filter((r) => r.action === "update").length,
    delete: cadetDiff.filter((r) => r.action === "delete").length,
    flagged: cadetDiff.filter((r) => r.flags.length > 0).length,
  };
  const cadreCounts = {
    create: cadreDiff.filter((r) => r.action === "create").length,
    update: cadreDiff.filter((r) => r.action === "update").length,
    missing: cadreDiff.filter((r) => r.action === "missing").length,
    flagged: cadreDiff.filter((r) => r.action !== "missing" && r.flags.length > 0).length,
  };
  const eventCounts = {
    total: eventsPlan.length,
    flagged: eventsPlan.filter((r) => r.flags.length > 0).length,
  };

  const updateCadetRow = (key: string, patch: Partial<CadetDiffRow>) => {
    setCadetDiff((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
      return next.map((r) => (r.key === key ? { ...r, flags: revalidateCadetDiffRow(r, next) } : r));
    });
  };
  const updateCadreRow = (key: string, patch: Partial<CadreDiffRow>) => {
    setCadreDiff((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
      return next.map((r) => (r.key === key ? { ...r, flags: revalidateCadreDiffRow(r, next) } : r));
    });
  };
  const updateEventRow = (key: string, patch: Partial<EventPlanRow>) => {
    setEventsPlan((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const updated = { ...r, ...patch };
        return { ...updated, flags: revalidateEventRow(updated, catalog) };
      })
    );
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(undefined);
    try {
      const sheets = [
        ...buildAttendanceSheets(roster, events, attendance),
        ...buildTrainingSheets(roster, catalog, completions, events),
        ...buildMemoSheets(absenceMemos, deviationMemos),
      ];
      await downloadWorkbook(`new-semester-backup-${todayForFilename()}.xlsx`, sheets);
      await downloadMemoPdfZip(`new-semester-memo-pdfs-${todayForFilename()}.zip`, roster);
      setExported(true);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Failed to export the backup.");
    } finally {
      setExporting(false);
    }
  };

  const handleRun = async () => {
    setStep("running");
    setRunError(undefined);
    setLog([]);
    try {
      await reauthenticate(password);
      appendLog("Password verified.");

      for (const name of ["attendance", "absenceMemos", "deviationMemos", "completions", "pmtEvents", "extraEvents", "extraEventAttendance"]) {
        const n = await deleteAllInCollection(name);
        appendLog(`Deleted ${n} document(s) from ${name}.`);
      }

      const pdfs = await listAllMemoPdfs();
      for (const pdf of pdfs) await deleteMemoPdf(pdf.path);
      appendLog(`Deleted ${pdfs.length} memo PDF(s) from storage.`);

      const cadetsToUpdate = cadetDiff.filter((r) => r.action === "update" && r.flags.length === 0);
      const cadetsToCreate = cadetDiff.filter((r) => r.action === "create" && r.flags.length === 0);
      const cadetsToDelete = cadetDiff.filter((r) => r.action === "delete");
      const cadetsSkipped = cadetDiff.filter((r) => (r.action === "create" || r.action === "update") && r.flags.length > 0);

      for (const row of cadetsToUpdate) {
        await updateCadet(row.existing!.id, cadetDiffRowToInput(row) as CadetInput);
      }
      appendLog(`Updated ${cadetsToUpdate.length} existing cadet(s).`);

      const createdEmails: string[] = [];
      for (const row of cadetsToCreate) {
        await createCadet(cadetDiffRowToInput(row) as CadetInput);
        createdEmails.push(row.email);
      }
      appendLog(`Created ${cadetsToCreate.length} new cadet(s).`);

      const deletedEmails: string[] = [];
      for (const row of cadetsToDelete) {
        await deleteCadet(row.existing!.id);
        if (row.email) deletedEmails.push(row.email);
      }
      appendLog(`Deleted ${cadetsToDelete.length} cadet(s) no longer on the roster.`);
      if (cadetsSkipped.length > 0) appendLog(`Skipped ${cadetsSkipped.length} cadet row(s) still flagged -- fix and re-add manually via Roster.`);

      if (createdEmails.length > 0) {
        const results = await createCadetAccounts(createdEmails);
        const failed = results.filter((r) => !r.success);
        appendLog(`Provisioned ${results.length - failed.length}/${results.length} new cadet login(s).`);
        for (const f of failed) appendLog(`  Login not created for ${f.email}: ${f.note ?? "unknown error"}`);
      }
      if (deletedEmails.length > 0) {
        const results = await disableCadetAccounts(deletedEmails);
        const failed = results.filter((r) => !r.success);
        appendLog(`Disabled ${results.length - failed.length}/${results.length} removed cadet login(s).`);
        for (const f of failed) appendLog(`  Login not disabled for ${f.email}: ${f.note ?? "unknown error"}`);
      }

      const cadreToUpdate = cadreDiff.filter((r) => r.action === "update" && r.flags.length === 0);
      const cadreToCreate = cadreDiff.filter((r) => r.action === "create" && r.flags.length === 0);
      const cadreSkipped = cadreDiff.filter((r) => r.action !== "missing" && r.flags.length > 0);

      for (const row of cadreToUpdate) {
        await updateCadetFields(row.existing!.id, { name: row.name, email: row.email, status: "Active" });
      }
      appendLog(`Updated ${cadreToUpdate.length} existing Cadre record(s).`);

      const createdCadreEmails: string[] = [];
      for (const row of cadreToCreate) {
        // asClass/devLevel are inert placeholders -- isCadre overrides deriveClass everywhere, these values are never read for Cadre.
        await createCadet({
          name: row.name,
          rank: undefined,
          asClass: "AS700",
          devLevel: "SCL",
          status: "Active",
          notes: "",
          email: row.email,
          flight: undefined,
          group: undefined,
          isCadre: true,
          isCwl: false,
          position: undefined,
          statusChangedDate: undefined,
          mustChangePassword: true,
        });
        createdCadreEmails.push(row.email);
      }
      appendLog(`Created ${cadreToCreate.length} new Cadre record(s).`);
      if (cadreSkipped.length > 0) appendLog(`Skipped ${cadreSkipped.length} Cadre row(s) still flagged -- fix and re-add manually via Roster.`);

      if (createdCadreEmails.length > 0) {
        const results = await createCadetAccounts(createdCadreEmails);
        const failed = results.filter((r) => !r.success);
        appendLog(`Provisioned ${results.length - failed.length}/${results.length} new Cadre login(s).`);
        for (const f of failed) appendLog(`  Login not created for ${f.email}: ${f.note ?? "unknown error"}`);
      }

      const eventsToCreate = eventsPlan.filter((r) => r.flags.length === 0);
      const eventsSkipped = eventsPlan.filter((r) => r.flags.length > 0);
      for (const row of eventsToCreate) {
        await createEvent(eventRowToInput(row, catalog));
      }
      appendLog(`Created ${eventsToCreate.length} PMT event(s).`);
      if (eventsSkipped.length > 0) appendLog(`Skipped ${eventsSkipped.length} event row(s) still flagged -- add manually via Events.`);

      await refetchAll();
      appendLog("Done.");
      setStep("done");
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Something went wrong partway through -- check the log above for what already completed.");
    }
  };

  const resetAll = () => {
    setStep("upload");
    setCadetFile(undefined);
    setCadreFile(undefined);
    setEventsFile(undefined);
    setCadetDiff([]);
    setCadreDiff([]);
    setEventsPlan([]);
    setExported(false);
    setAcknowledged(false);
    setPassword("");
    setLog([]);
    setRunError(undefined);
  };

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold">
        <CalendarPlus className="h-5 w-5 text-primary" />
        New Semester
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Reverifies the roster, calendar, and cadet logins against 3 new tab-delimited files, backs up everything first, then wipes attendance,
        memos, Training Objective progress, and the PMT calendar for the new semester.
      </p>

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload the 3 files</CardTitle>
            <CardDescription>
              Build each in Excel with columns in this exact order, then save as "Text (Tab delimited) (*.txt)". Download a blank template
              below to get the header row right.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileUploadRow label="Cadet Roster" columns={CADET_ROSTER_COLUMNS} templateFilename="cadet-roster-template.txt" file={cadetFile} onFile={setCadetFile} />
            <FileUploadRow label="Cadre Roster" columns={CADRE_ROSTER_COLUMNS} templateFilename="cadre-roster-template.txt" file={cadreFile} onFile={setCadreFile} />
            <FileUploadRow label="Events" columns={EVENTS_COLUMNS} templateFilename="events-template.txt" file={eventsFile} onFile={setEventsFile} />
            <p className="text-xs text-muted-foreground">
              "TOs Covered" format: PLO abbreviation + number, comma-separated (e.g. "LOC 3.1, DP 2.1"). PLO abbreviations: LOC = Leader of
              Character, DP = Disciplined Professional, EC = Effective Communicator, WF = Warfighter, SMO = Strategic-Minded Officer. Date is
              MM/DD/YYYY, Time is 24-hour with no colon (e.g. 1730).
            </p>
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            <Button onClick={handleParse} disabled={!cadetFile || !cadreFile || !eventsFile || parsing}>
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {parsing ? "Reading..." : "Parse & Review"}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>2. Review Cadet Roster changes</CardTitle>
              <CardDescription>
                {cadetCounts.create} new · {cadetCounts.update} updated · {cadetCounts.delete} removed (missing from the file)
                {cadetCounts.flagged > 0 && ` · ${cadetCounts.flagged} flagged`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table aria-label="Cadet Roster review">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Rank</TableHead>
                      <TableHead>AS Level</TableHead>
                      <TableHead>Dev Level</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Flight</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cadetDiff.map((row) => (
                      <TableRow key={row.key} className={row.flags.length > 0 ? "bg-destructive/5" : undefined}>
                        <TableCell>
                          <Badge variant={ACTION_BADGE[row.action]}>{row.action}</Badge>
                        </TableCell>
                        <TableCell className="min-w-40">
                          {row.action === "delete" ? (
                            row.name
                          ) : (
                            <Input className="h-7 text-xs" value={row.name} onChange={(e) => updateCadetRow(row.key, { name: e.target.value })} />
                          )}
                          <FlagList flags={row.flags} />
                        </TableCell>
                        <TableCell>
                          {row.action === "delete" ? (
                            row.rank
                          ) : (
                            <Input className="h-7 w-20 text-xs" value={row.rank} onChange={(e) => updateCadetRow(row.key, { rank: e.target.value })} />
                          )}
                        </TableCell>
                        <TableCell>
                          {row.action === "delete" ? (
                            row.asClass
                          ) : (
                            <Select value={row.asClass || undefined} onValueChange={(v) => updateCadetRow(row.key, { asClass: v })}>
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue placeholder="?" />
                              </SelectTrigger>
                              <SelectContent>
                                {AS_CLASSES.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.action === "delete" ? (
                            row.devLevel
                          ) : (
                            <Select value={row.devLevel || undefined} onValueChange={(v) => updateCadetRow(row.key, { devLevel: v })}>
                              <SelectTrigger className="h-7 w-20 text-xs">
                                <SelectValue placeholder="?" />
                              </SelectTrigger>
                              <SelectContent>
                                {DEV_LEVELS.map((l) => (
                                  <SelectItem key={l} value={l}>
                                    {l}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.action === "delete" ? (
                            row.group
                          ) : (
                            <Select value={row.group || "none"} onValueChange={(v) => updateCadetRow(row.key, { group: v === "none" ? "" : v })}>
                              <SelectTrigger className="h-7 w-20 text-xs">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                {GROUPS.map((g) => (
                                  <SelectItem key={g} value={g}>
                                    {g}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.action === "delete" ? (
                            row.flight
                          ) : (
                            <Select value={row.flight || "none"} onValueChange={(v) => updateCadetRow(row.key, { flight: v === "none" ? "" : v })}>
                              <SelectTrigger className="h-7 w-16 text-xs">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                {FLIGHTS.map((f) => (
                                  <SelectItem key={f} value={f}>
                                    {f}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.action === "delete" ? (
                            row.position
                          ) : (
                            <Input className="h-7 w-28 text-xs" value={row.position} onChange={(e) => updateCadetRow(row.key, { position: e.target.value })} />
                          )}
                        </TableCell>
                        <TableCell>
                          {row.action === "delete" ? (
                            row.email
                          ) : (
                            <Input className="h-7 w-44 text-xs" value={row.email} onChange={(e) => updateCadetRow(row.key, { email: e.target.value })} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {cadetDiff.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No rows parsed.
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
              <CardTitle>Review Cadre Roster changes</CardTitle>
              <CardDescription>
                {cadreCounts.create} new · {cadreCounts.update} updated · {cadreCounts.missing} not in the new file (flagged, no automatic action)
                {cadreCounts.flagged > 0 && ` · ${cadreCounts.flagged} flagged`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table aria-label="Cadre Roster review">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cadreDiff.map((row) => (
                      <TableRow key={row.key} className={row.flags.length > 0 ? "bg-destructive/5" : undefined}>
                        <TableCell>
                          <Badge variant={ACTION_BADGE[row.action]}>{row.action}</Badge>
                        </TableCell>
                        <TableCell className="min-w-40">
                          {row.action === "missing" ? (
                            row.name
                          ) : (
                            <Input className="h-7 text-xs" value={row.name} onChange={(e) => updateCadreRow(row.key, { name: e.target.value })} />
                          )}
                          <FlagList flags={row.flags} />
                        </TableCell>
                        <TableCell>
                          {row.action === "missing" ? (
                            row.email
                          ) : (
                            <Input className="h-7 w-44 text-xs" value={row.email} onChange={(e) => updateCadreRow(row.key, { email: e.target.value })} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {cadreDiff.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No rows parsed.
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
              <CardTitle>Review Events (full calendar replacement)</CardTitle>
              <CardDescription>
                {eventCounts.total} event(s) will replace the entire current PMT calendar.
                {eventCounts.flagged > 0 && ` · ${eventCounts.flagged} flagged`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table aria-label="Events review">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>TW</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>POCIC1</TableHead>
                      <TableHead>POCIC2</TableHead>
                      <TableHead>POCIC3</TableHead>
                      <TableHead>POCSUP</TableHead>
                      <TableHead>TOs Covered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsPlan.map((row) => (
                      <TableRow key={row.key} className={row.flags.length > 0 ? "bg-destructive/5" : undefined}>
                        <TableCell>
                          <Input className="h-7 w-24 text-xs" value={row.date} onChange={(e) => updateEventRow(row.key, { date: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-16 text-xs" value={row.time} onChange={(e) => updateEventRow(row.key, { time: e.target.value })} />
                        </TableCell>
                        <TableCell className="min-w-40">
                          <Input className="h-7 text-xs" value={row.title} onChange={(e) => updateEventRow(row.key, { title: e.target.value })} />
                          <FlagList flags={row.flags} />
                        </TableCell>
                        <TableCell>
                          <Select value={matchType(row.typeRaw) ?? "none"} onValueChange={(v) => updateEventRow(row.key, { typeRaw: v === "none" ? "" : v })}>
                            <SelectTrigger className="h-7 w-20 text-xs">
                              <SelectValue placeholder="?" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">—</SelectItem>
                              {PMT_EVENT_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-12 text-xs" value={row.twRaw} onChange={(e) => updateEventRow(row.key, { twRaw: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-28 text-xs" value={row.location} onChange={(e) => updateEventRow(row.key, { location: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-28 text-xs" value={row.pocic} onChange={(e) => updateEventRow(row.key, { pocic: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-28 text-xs" value={row.pocic2} onChange={(e) => updateEventRow(row.key, { pocic2: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-28 text-xs" value={row.pocic3} onChange={(e) => updateEventRow(row.key, { pocic3: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-28 text-xs" value={row.pocsup} onChange={(e) => updateEventRow(row.key, { pocsup: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 w-40 text-xs" value={row.toCoveredRaw} onChange={(e) => updateEventRow(row.key, { toCoveredRaw: e.target.value })} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {eventsPlan.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground">
                          No rows parsed.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button onClick={() => setStep("acknowledge")}>Continue to Export</Button>
          </div>
        </div>
      )}

      {step === "acknowledge" && (
        <Card>
          <CardHeader>
            <CardTitle>3. Export a backup, then confirm</CardTitle>
            <CardDescription>
              Downloads a full Excel backup (roster, attendance, Training Objectives, memorandums) and a .zip of every memo PDF currently in
              storage. Nothing is deleted until you confirm below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? "Exporting..." : exported ? "Re-export" : "Export Backup"}
            </Button>
            {exportError && <p className="text-sm text-destructive">{exportError}</p>}
            {exported && (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Backup downloaded. Check your Downloads folder for both files.
              </p>
            )}

            {exported && (
              <div className="space-y-3 border-t border-input pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />I have saved/verified the
                  exported backup files.
                </label>
                <div className="grid max-w-xs gap-1.5">
                  <Label>Your password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setStep("review")}>
                    Back
                  </Button>
                  <Button variant="destructive" onClick={handleRun} disabled={!acknowledged || !password}>
                    Confirm & Run New Semester Reset
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "running" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Running...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 font-mono text-xs">
              {log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {runError && <p className="mt-3 text-sm text-destructive">{runError}</p>}
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" />
              New Semester reset complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="mb-4 space-y-1 font-mono text-xs">
              {log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <Button onClick={resetAll}>Start another import</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function matchType(raw: string): string | undefined {
  const n = raw.trim().toLowerCase();
  return PMT_EVENT_TYPES.find((t) => t.toLowerCase() === n);
}
