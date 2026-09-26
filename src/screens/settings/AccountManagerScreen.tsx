import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { UserCog } from "lucide-react";
import { resolveTabAccess } from "../../domain/access";
import { compareByLastName } from "../../domain/nameUtils";
import type { Cadet } from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";

interface Props {
  roster: Cadet[];
  updateCadetFields: (id: string, input: Partial<CadetInput>) => Promise<void>;
}

/** Human-readable label for whatever tier `resolveTabAccess` resolves someone to -- explicit `ACCESS_BY_EMAIL` overrides (the ~15 named exceptions) read as "Custom (code-defined)" since editing those needs a code change, by design. */
function accessLabel(cadet: Cadet, roster: Cadet[]): string {
  if (!cadet.email) return "No email on file";
  const access = resolveTabAccess(cadet.email, roster);
  if (access.trainingObjectives === "full" && access.accountability && access.memoReview && access.memoReviewAbsence) return "Full access (custom)";
  if (access.trainingObjectives !== "none" || access.accountability || access.memoReview) return "Custom (code-defined)";
  return access.gmcDashboard ? "GMC self-service Dashboard + Memo Submission" : "Memo Submission only";
}

/** Section 6.1 -- gated to the whole ALL_ACCESS tier. Since there's no client-side way to enumerate raw Firebase Auth accounts without the Admin SDK, "managing accounts" here means the roster-driven part of access (email/isCadre/position/group/flight, which `resolveTabAccess`'s fallback reads) plus a transparent view of what each person currently resolves to. */
export function AccountManagerScreen({ roster, updateCadetFields }: Props) {
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roster
      .filter((p) => query === "" || p.name.toLowerCase().includes(query) || (p.email ?? "").toLowerCase().includes(query))
      .sort((a, b) => compareByLastName(a.name, b.name));
  }, [roster, search]);

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold">
        <UserCog className="h-5 w-5 text-primary" />
        Account Manager
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Every account is created individually in the Firebase Console -- this only manages the roster fields (Cadre flag, position, group, flight) that
        decide what a signed-in person can see. The ~15 named exceptions (Cadre, Cortes Garay, Group/Flight Commanders, etc.) are defined in code and
        aren't editable from here.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Roster accounts</CardTitle>
          <CardDescription>Search by name or email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="overflow-x-auto">
            <Table aria-label="Account manager">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Cadre</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Resolved access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.email ?? "—"}</TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={p.isCadre}
                        onChange={(e) => updateCadetFields(p.id, { isCadre: e.target.checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        defaultValue={p.position ?? ""}
                        placeholder="Optional"
                        className="h-8 w-40"
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== (p.position ?? "")) updateCadetFields(p.id, { position: value === "" ? undefined : value });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{accessLabel(p, roster)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No one matches this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
