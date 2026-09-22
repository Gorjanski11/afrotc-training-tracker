import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Search, ExternalLink } from "lucide-react";
import { compareByLastName } from "../../domain/nameUtils";
import type { AbsenceMemoStatus, DeviationMemoStatus } from "../../domain/constants";
import type { AbsenceMemo, DeviationMemo, PmtEvent, Cadet } from "../../domain/types";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  absenceMemos: AbsenceMemo[];
  deviationMemos: DeviationMemo[];
}

function AbsenceStatusBadge({ status }: { status: AbsenceMemoStatus }) {
  const variant = status === "Accepted" ? "success" : status === "Rejected" ? "destructive" : status === "Returned" ? "warning" : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

function DeviationStatusBadge({ status }: { status: DeviationMemoStatus }) {
  const variant = status === "Accepted" ? "success" : status === "Returned" ? "warning" : status === "Submitted" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

/** Searchable-by-cadet-name view across both memo types -- everything one cadet has ever filed or been assigned, in one place. */
export function HistoryScreen({ roster, events, absenceMemos, deviationMemos }: Props) {
  const [search, setSearch] = useState("");
  const [selectedCadetId, setSelectedCadetId] = useState("");

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return [...roster].filter((p) => p.name.toLowerCase().includes(q)).sort((a, b) => compareByLastName(a.name, b.name));
  }, [roster, search]);

  const selected = roster.find((p) => p.id === selectedCadetId);
  const cadetAbsenceMemos = useMemo(
    () => absenceMemos.filter((m) => m.cadetId === selectedCadetId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [absenceMemos, selectedCadetId]
  );
  const cadetDeviationMemos = useMemo(
    () => deviationMemos.filter((m) => m.cadetId === selectedCadetId).sort((a, b) => b.dateAssigned.localeCompare(a.dateAssigned)),
    [deviationMemos, selectedCadetId]
  );

  const eventLabel = (id: string) => {
    const e = events.find((ev) => ev.id === id);
    return e ? `${e.eventType} ${new Date(e.eventDate).toLocaleDateString()}` : "deleted PMT";
  };

  const coverageSummary = (m: AbsenceMemo): string => {
    const parts: string[] = [];
    if (m.pmtEventIds.length > 0) parts.push(m.pmtEventIds.map(eventLabel).join(", "));
    if (m.asClass) parts.push(`${m.asClass} class (${m.classDate ? new Date(m.classDate).toLocaleDateString() : "no date"})`);
    return parts.join(" + ") || "—";
  };

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <Search className="h-5 w-5 text-primary" />
        Memo History
      </h2>

      <div className="mb-4 max-w-md space-y-1.5">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedCadetId("");
          }}
          placeholder="Search cadet by name..."
        />
        {search.trim() && !selected && (
          <div className="rounded-md border border-input bg-popover">
            {matches.slice(0, 8).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedCadetId(p.id);
                  setSearch(p.name);
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {p.name}
              </button>
            ))}
            {matches.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No cadet found.</p>}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Absence Memos — {selected.name}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <Table aria-label="Cadet absence memo history">
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Covers</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cadetAbsenceMemos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{new Date(m.submittedAt).toLocaleDateString()}</TableCell>
                      <TableCell className="max-w-xs truncate" title={coverageSummary(m)}>
                        {coverageSummary(m)}
                      </TableCell>
                      <TableCell>{m.reason}</TableCell>
                      <TableCell>
                        <AbsenceStatusBadge status={m.status} />
                      </TableCell>
                      <TableCell>
                        {m.pdfUrl ? (
                          <a href={m.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                            <ExternalLink className="h-3 w-3" />
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {cadetAbsenceMemos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No absence memos on file.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deviation Memos — {selected.name}</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <Table aria-label="Cadet deviation memo history">
                <TableHeader>
                  <TableRow>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cadetDeviationMemos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{new Date(m.dateAssigned).toLocaleDateString()}</TableCell>
                      <TableCell className="max-w-xs truncate">{m.reason}</TableCell>
                      <TableCell>
                        <DeviationStatusBadge status={m.status} />
                      </TableCell>
                      <TableCell>
                        {m.pdfUrl ? (
                          <a href={m.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                            <ExternalLink className="h-3 w-3" />
                            View
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {cadetDeviationMemos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No deviation memos on file.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
