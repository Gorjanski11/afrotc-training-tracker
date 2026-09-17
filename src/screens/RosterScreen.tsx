import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Search, UploadCloud, Users } from "lucide-react";
import { computeCadetProgress } from "../domain/progress";
import { compareByLastName } from "../domain/nameUtils";
import { CadetFormDialog } from "../components/CadetFormDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { CadetInput } from "../hooks/useCadets";
import type { Cadet, Completion, PmtEvent, TrainingObjective } from "../domain/types";

type SortKey = "name" | "asClass" | "devLevel" | "status" | "percent";

interface Props {
  cadets: Cadet[];
  catalog: TrainingObjective[];
  completions: Completion[];
  pmtEvents: PmtEvent[];
  createCadet: (input: CadetInput) => Promise<Cadet>;
  updateCadet: (id: string, input: CadetInput) => Promise<Cadet>;
  deleteCadet: (cadetId: string) => Promise<void>;
  onSelectCadet: (cadetId: string) => void;
  /** Admin-only: (re-)import the Training Objectives catalog from the bundled seed JSON. Idempotent -- safe to re-run. */
  importCatalog: () => Promise<number>;
}

export function RosterScreen({ cadets, catalog, completions, pmtEvents, createCadet, updateCadet, deleteCadet, onSelectCadet, importCatalog }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingCadet, setEditingCadet] = useState<Cadet | undefined>();
  const [deletingCadet, setDeletingCadet] = useState<Cadet | undefined>();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | undefined>();

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cadets
      .filter((c) => query === "" || c.name.toLowerCase().includes(query))
      .map((cadet) => ({
        cadet,
        progress: computeCadetProgress(
          cadet.devLevel,
          catalog,
          completions.filter((c) => c.cadetId === cadet.id),
          pmtEvents
        ),
      }))
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === "name") cmp = compareByLastName(a.cadet.name, b.cadet.name);
        else if (sortKey === "asClass") cmp = (a.cadet.asClass ?? "").localeCompare(b.cadet.asClass ?? "");
        else if (sortKey === "devLevel") cmp = (a.cadet.devLevel ?? "").localeCompare(b.cadet.devLevel ?? "");
        else if (sortKey === "status") cmp = (a.cadet.status ?? "").localeCompare(b.cadet.status ?? "");
        else cmp = a.progress.percent - b.progress.percent;
        return sortAsc ? cmp : -cmp;
      });
  }, [cadets, catalog, completions, pmtEvents, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const deletingCadetCompletionCount = deletingCadet ? completions.filter((c) => c.cadetId === deletingCadet.id).length : 0;

  const handleImport = async () => {
    setImporting(true);
    setImportMessage(undefined);
    try {
      const count = await importCatalog();
      setImportMessage(`Imported/updated ${count} Training Objectives.`);
    } catch (e) {
      setImportMessage(e instanceof Error ? `Import failed: ${e.message}` : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="h-5 w-5 text-primary" />
          Roster Management
        </h2>
        <Button
          onClick={() => {
            setEditingCadet(undefined);
            setFormOpen(true);
          }}
        >
          <Plus />
          Add Cadet
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="flex items-center gap-4 p-3">
          <Button variant="outline" onClick={handleImport} disabled={importing}>
            <UploadCloud />
            {importing ? "Importing..." : "Import / Re-sync Training Objectives Catalog"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {importMessage ?? `Catalog currently has ${catalog.length} Training Objective(s). Safe to re-run after fixing a transcription typo.`}
          </span>
        </CardContent>
      </Card>

      <div className="mb-4 relative w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Look up a cadet by name..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Table aria-label="Roster management">
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
              Name {sortKey === "name" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("asClass")}>
              AS Class {sortKey === "asClass" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("devLevel")}>
              Dev Level {sortKey === "devLevel" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
              Status {sortKey === "status" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("percent")}>
              Completion {sortKey === "percent" ? (sortAsc ? "▲" : "▼") : ""}
            </TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ cadet, progress }) => (
            <TableRow key={cadet.id}>
              <TableCell>
                <span className="cursor-pointer text-primary hover:underline" onClick={() => onSelectCadet(cadet.id)}>
                  {cadet.name}
                </span>
              </TableCell>
              <TableCell>{cadet.asClass ?? "—"}</TableCell>
              <TableCell>{cadet.devLevel ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={cadet.status === "Active" ? "success" : cadet.status === "Commissioned" ? "default" : "secondary"}>
                  {cadet.status ?? "—"}
                </Badge>
              </TableCell>
              <TableCell>{progress.percent}%</TableCell>
              <TableCell className="text-sm text-muted-foreground">{cadet.notes}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingCadet(cadet);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeletingCadet(cadet)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>{cadets.length === 0 ? 'No cadets yet. Click "Add Cadet" to get started.' : "No cadets match this search."}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {formOpen && (
        <CadetFormDialog
          open
          onClose={() => setFormOpen(false)}
          existingCadet={editingCadet}
          onSave={async (input) => {
            if (editingCadet) {
              await updateCadet(editingCadet.id, input);
            } else {
              await createCadet(input);
            }
          }}
        />
      )}

      {deletingCadet && (
        <ConfirmDialog
          open
          onClose={() => setDeletingCadet(undefined)}
          title={`Delete ${deletingCadet.name}?`}
          description={`This permanently removes them from the roster${
            deletingCadetCompletionCount > 0 ? ` along with their ${deletingCadetCompletionCount} logged Training Objective completion(s)` : ""
          }. This cannot be undone.`}
          onConfirm={() => deleteCadet(deletingCadet.id)}
        />
      )}
    </div>
  );
}
