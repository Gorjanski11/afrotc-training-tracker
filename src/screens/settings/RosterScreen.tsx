import { useMemo, useState } from "react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, Copy, Dices, KeyRound, LogIn, Pencil, Plus, Search, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { deriveClass, isCwlMember, FLIGHTS, GROUPS, type Flight, type Group, type Standing } from "../../domain/constants";
import { computeCadetAttendanceSummary } from "../../domain/attendance";
import { computeCadetProgress } from "../../domain/progress";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import { applyUnitScope, canManageAccounts, isCortesGaray, isFullAccess, resolveTabAccess, type UnitScope } from "../../domain/access";
import { CadetFormDialog } from "../../components/CadetFormDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { Attendance, Cadet, Completion, PmtEvent, TrainingObjective } from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";

interface Props {
  roster: Cadet[];
  events: PmtEvent[];
  attendance: Attendance[];
  catalog: TrainingObjective[];
  completions: Completion[];
  createCadet: (input: CadetInput) => Promise<Cadet>;
  updateCadet: (id: string, input: CadetInput) => Promise<Cadet>;
  updateCadetFields: (id: string, input: Partial<CadetInput>) => Promise<void>;
  deleteCadet: (cadetId: string) => Promise<void>;
  /** A Flight/Group Commander only sees and looks up cadets in their own unit here (Section A4) -- no Add/Edit/Delete. */
  unitScope: UnitScope;
  userEmail: string | null | undefined;
  reauthenticate: (password: string) => Promise<void>;
  resetOtherPassword: (targetEmail: string, newPassword: string) => Promise<void>;
  /** Cortes Garay only -- signs the current browser session in as another account entirely, no password needed or changed. */
  impersonate: (targetEmail: string) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function StandingBadge({ standing }: { standing: Standing | undefined }) {
  if (!standing) return <span className="text-muted-foreground">—</span>;
  const variant = standing === "Good" ? "success" : standing === "Warning" ? "warning" : "destructive";
  return <Badge variant={variant}>{standing}</Badge>;
}

/** Human-readable label for whatever tier `resolveTabAccess` resolves someone to -- explicit `ACCESS_BY_EMAIL` overrides (the ~15 named exceptions) read as "Custom (code-defined)" since editing those needs a code change, by design. */
function accessLabel(cadet: Cadet, roster: Cadet[]): string {
  if (!cadet.email) return "No email on file";
  const access = resolveTabAccess(cadet.email, roster);
  if (access.trainingObjectives === "full" && access.accountability && access.memoReview && access.memoReviewAbsence) return "Full access (custom)";
  if (access.trainingObjectives !== "none" || access.accountability || access.memoReview) return "Custom (code-defined)";
  return access.gmcDashboard ? "GMC self-service Dashboard + Memo Submission" : "Memo Submission only";
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Unified Roster + Account Manager (Section 16) -- one screen, one table. Roster's own columns
 * (name/class/level/flight/group/position/status/completion/standings, plus Add/Edit/Delete and
 * Inactivate/Reactivate) show for everyone who can open Settings at all; the Account-Manager-tier
 * columns and actions (Email, C/Rank, Cadre, resolved access badge, Reset password, Sign in as) only
 * show for whoever used to see the separate Account Manager tab (`canManageAccounts`), with the
 * narrowest ones (Rank/Cadre/access badge) staying `isFullAccess`-only exactly as before. Deliberately
 * shows everyone including Cadre -- this is the "account database" view (Section 4's one exception
 * to Cadre being non-trackable everywhere else).
 */
export function RosterScreen({
  roster,
  events,
  attendance,
  catalog,
  completions,
  createCadet,
  updateCadet,
  updateCadetFields,
  deleteCadet,
  unitScope,
  userEmail,
  reauthenticate,
  resetOtherPassword,
  impersonate,
}: Props) {
  const scoped = unitScope.kind !== "all";
  // Flight Commanders, Group Commanders, and Santiago (TRG Group Commander + all-GMC visibility) can
  // set Active/Inactive for cadets in their own unit -- everything else about the roster (name,
  // level, flight/group, position, Add/Delete) stays Cadre/Cortes-Garay/CWL-only. The bare "gmc"
  // scope (Montalvo, CTO -- not a Group Commander) is deliberately excluded.
  const canInactivate = unitScope.kind === "flight" || unitScope.kind === "group" || unitScope.kind === "group-and-gmc";
  const fullAccess = isFullAccess(userEmail, roster);
  const canManage = canManageAccounts(userEmail, roster);
  // Narrower than canManage -- CWL and unit-scoped commanders can reset a password, but only Cortes
  // Garay can sign in AS someone else outright, since that's strictly more powerful (it bypasses
  // Cadre's own password entirely, no reset or notice to them required).
  const canImpersonate = isCortesGaray(userEmail);
  const scopedRoster = useMemo(() => applyUnitScope(unitScope, roster), [unitScope, roster]);
  const [search, setSearch] = useState("");
  const [flightFilter, setFlightFilter] = useState<Flight | "All">("All");
  const [groupFilter, setGroupFilter] = useState<Group | "All">("All");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCadet, setEditingCadet] = useState<Cadet | undefined>();
  const [deletingCadet, setDeletingCadet] = useState<Cadet | undefined>();
  const [deactivatingCadet, setDeactivatingCadet] = useState<Cadet | undefined>();

  const handleFlightChange = (v: string) => {
    setFlightFilter(v as Flight | "All");
    if (v !== "All") setGroupFilter("All");
  };
  const handleGroupChange = (v: string) => {
    setGroupFilter(v as Group | "All");
    if (v !== "All") setFlightFilter("All");
  };

  const pmtEventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const completionsByCadet = useMemo(() => {
    const map = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = map.get(c.cadetId) ?? [];
      list.push(c);
      map.set(c.cadetId, list);
    }
    return map;
  }, [completions]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scopedRoster
      .filter((p) => query === "" || p.name.toLowerCase().includes(query) || (p.email ?? "").toLowerCase().includes(query))
      .filter((p) => scoped || flightFilter === "All" || p.flight === flightFilter)
      .filter((p) => scoped || groupFilter === "All" || p.group === groupFilter)
      .map((person) => ({
        person,
        cls: deriveClass(person.asClass, person.isCadre),
        progress: computeCadetProgress(person.devLevel, catalog, completionsByCadet.get(person.id) ?? [], events),
        summary: computeCadetAttendanceSummary(person.id, attendance, pmtEventsById),
      }))
      .sort((a, b) => compareByLastName(a.person.name, b.person.name));
  }, [scopedRoster, scoped, search, flightFilter, groupFilter, catalog, completionsByCadet, events, attendance, pmtEventsById]);

  const deletingCompletionCount = deletingCadet ? (completionsByCadet.get(deletingCadet.id) ?? []).length : 0;

  // -- Reset password --
  const [resetTarget, setResetTarget] = useState<Cadet | undefined>();
  const [newPassword, setNewPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();
  const [justReset, setJustReset] = useState<{ name: string; password: string } | undefined>();
  const [copied, setCopied] = useState(false);

  const openReset = (cadet: Cadet) => {
    setResetTarget(cadet);
    setNewPassword(generatePassword());
    setAdminPassword("");
    setResetError(undefined);
  };
  const closeResetDialog = () => {
    setResetTarget(undefined);
    setNewPassword("");
    setAdminPassword("");
    setResetError(undefined);
  };
  const handleReset = async () => {
    if (!resetTarget?.email || newPassword.length < 6 || !adminPassword) return;
    setResetBusy(true);
    setResetError(undefined);
    try {
      await reauthenticate(adminPassword);
      await resetOtherPassword(resetTarget.email, newPassword);
      await updateCadetFields(resetTarget.id, { mustChangePassword: true });
      setJustReset({ name: formatCadetName(resetTarget), password: newPassword });
      setCopied(false);
      closeResetDialog();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Failed to reset -- check your own password and try again.");
    } finally {
      setResetBusy(false);
    }
  };

  // -- Sign in as (impersonate) --
  const [impersonateTarget, setImpersonateTarget] = useState<Cadet | undefined>();
  const [impersonatePassword, setImpersonatePassword] = useState("");
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | undefined>();

  const openImpersonate = (cadet: Cadet) => {
    setImpersonateTarget(cadet);
    setImpersonatePassword("");
    setImpersonateError(undefined);
  };
  const closeImpersonateDialog = () => {
    setImpersonateTarget(undefined);
    setImpersonatePassword("");
    setImpersonateError(undefined);
  };
  const handleImpersonate = async () => {
    if (!impersonateTarget?.email || !impersonatePassword) return;
    setImpersonating(true);
    setImpersonateError(undefined);
    try {
      await reauthenticate(impersonatePassword);
      await impersonate(impersonateTarget.email);
      closeImpersonateDialog();
    } catch (e) {
      setImpersonateError(e instanceof Error ? e.message : "Failed to sign in as this account -- check your own password and try again.");
    } finally {
      setImpersonating(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="h-5 w-5 text-primary" />
          Roster
        </h2>
        {!scoped && (
          <Button
            onClick={() => {
              setEditingCadet(undefined);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add Cadet
          </Button>
        )}
      </div>

      {justReset && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-success/50 bg-success/10 p-3 text-sm">
          <span>
            Password reset for <strong>{justReset.name}</strong>: <code className="rounded bg-background px-1.5 py-0.5">{justReset.password}</code>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(justReset.password);
              setCopied(true);
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Look up a cadet by name or email..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!scoped && (
          <Select value={flightFilter} onValueChange={handleFlightChange}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Flight" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All flights</SelectItem>
              {FLIGHTS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f} Flight
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!scoped && (
          <Select value={groupFilter} onValueChange={handleGroupChange}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All groups</SelectItem>
              {GROUPS.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table aria-label="Roster">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {canManage && <TableHead>Email</TableHead>}
              <TableHead>Class</TableHead>
              <TableHead>AS Class</TableHead>
              <TableHead>Dev Level</TableHead>
              <TableHead>Flight</TableHead>
              <TableHead>Group</TableHead>
              {fullAccess && <TableHead>C/Rank</TableHead>}
              {fullAccess && <TableHead>Cadre</TableHead>}
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Completion %</TableHead>
              <TableHead>PT %</TableHead>
              <TableHead>PT Standing</TableHead>
              <TableHead>LLAB/FM/D&C %</TableHead>
              <TableHead>LLAB/FM/D&C Standing</TableHead>
              {fullAccess && <TableHead>Resolved access</TableHead>}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ person, cls, progress, summary }) => (
              <TableRow key={person.id} className={person.status === "Inactive" ? "text-muted-foreground" : undefined}>
                <TableCell className="whitespace-nowrap">
                  {formatCadetName(person)}
                  {isCwlMember(person.asClass, person.isCwl) && (
                    <Badge variant="outline" className="ml-1.5">
                      CWL
                    </Badge>
                  )}
                </TableCell>
                {canManage && <TableCell className="whitespace-nowrap">{person.email ?? "—"}</TableCell>}
                <TableCell>
                  <Badge variant="outline">{cls}</Badge>
                </TableCell>
                <TableCell>{person.asClass ?? "—"}</TableCell>
                <TableCell>{person.devLevel ?? "—"}</TableCell>
                <TableCell>{person.flight ?? "—"}</TableCell>
                <TableCell>{person.group ?? "—"}</TableCell>
                {fullAccess && (
                  <TableCell>
                    {person.isCadre ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Input
                        defaultValue={person.rank ?? ""}
                        placeholder="e.g. 2d Lt"
                        className="h-8 w-28"
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== (person.rank ?? "")) updateCadetFields(person.id, { rank: value === "" ? undefined : value });
                        }}
                      />
                    )}
                  </TableCell>
                )}
                {fullAccess && (
                  <TableCell>
                    <input type="checkbox" checked={person.isCadre} onChange={(e) => updateCadetFields(person.id, { isCadre: e.target.checked })} />
                  </TableCell>
                )}
                <TableCell>
                  {fullAccess ? (
                    <Input
                      defaultValue={person.position ?? ""}
                      placeholder="Optional"
                      className="h-8 w-40"
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== (person.position ?? "")) updateCadetFields(person.id, { position: value === "" ? undefined : value });
                      }}
                    />
                  ) : (
                    person.position ?? "—"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={person.status === "Active" ? "success" : "secondary"}>{person.status ?? "—"}</Badge>
                </TableCell>
                <TableCell>{cls === "Cadre" ? "—" : `${progress.percent}%`}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : summary.pt.percent === undefined ? "—" : `${Math.round(summary.pt.percent * 100)}%`}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : <StandingBadge standing={summary.pt.standing} />}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : summary.llabFm.percent === undefined ? "—" : `${Math.round(summary.llabFm.percent * 100)}%`}</TableCell>
                <TableCell>{cls === "Cadre" ? "—" : <StandingBadge standing={summary.llabFm.standing} />}</TableCell>
                {fullAccess && (
                  <TableCell>
                    <Badge variant="outline">{accessLabel(person, roster)}</Badge>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-1">
                    {!scoped && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingCadet(person);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeletingCadet(person)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                    {scoped &&
                      canInactivate &&
                      !person.isCadre &&
                      (person.status === "Inactive" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Reactivate"
                          onClick={() => updateCadetFields(person.id, { status: "Active", statusChangedDate: todayIso() })}
                        >
                          <UserCheck className="h-3.5 w-3.5 text-success" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Set Inactive" onClick={() => setDeactivatingCadet(person)}>
                          <UserX className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      ))}
                    {person.email && person.status !== "Inactive" && canManage && (
                      <Button variant="outline" size="sm" onClick={() => openReset(person)}>
                        <KeyRound className="h-3.5 w-3.5" />
                        Reset password
                      </Button>
                    )}
                    {person.email &&
                      person.status !== "Inactive" &&
                      canImpersonate &&
                      person.email.trim().toLowerCase() !== (userEmail ?? "").trim().toLowerCase() && (
                        <Button variant="outline" size="sm" onClick={() => openImpersonate(person)}>
                          <LogIn className="h-3.5 w-3.5" />
                          Sign in as
                        </Button>
                      )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={16} className="text-center text-muted-foreground">
                  No one matches this filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {formOpen && (
        <CadetFormDialog
          open
          onClose={() => setFormOpen(false)}
          existingCadet={editingCadet}
          onSave={async (input) => {
            if (editingCadet) await updateCadet(editingCadet.id, input);
            else await createCadet(input);
          }}
        />
      )}

      {deletingCadet && (
        <ConfirmDialog
          open
          onClose={() => setDeletingCadet(undefined)}
          title={`Delete ${formatCadetName(deletingCadet)}?`}
          description={`This permanently removes them from the roster${
            deletingCompletionCount > 0 ? ` along with their ${deletingCompletionCount} logged Training Objective completion(s)` : ""
          }. This cannot be undone.`}
          onConfirm={() => deleteCadet(deletingCadet.id)}
        />
      )}

      {deactivatingCadet && (
        <ConfirmDialog
          open
          onClose={() => setDeactivatingCadet(undefined)}
          title={`Set ${formatCadetName(deactivatingCadet)} Inactive?`}
          description="They'll stop appearing in Accountability and Training Objectives tracking until reactivated. This can be undone at any time."
          onConfirm={() => updateCadetFields(deactivatingCadet.id, { status: "Inactive", statusChangedDate: todayIso() })}
        />
      )}

      {canManage && (
        <Dialog open={!!resetTarget} onOpenChange={(o) => !o && closeResetDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reset password for {resetTarget ? formatCadetName(resetTarget) : ""}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label>New password</Label>
                <div className="flex gap-2">
                  <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <Button type="button" variant="outline" size="icon" title="Generate a new random password" onClick={() => setNewPassword(generatePassword())}>
                    <Dices className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">At least 6 characters. Give this to {resetTarget?.name.split(",")[0] ?? "them"} directly.</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Your password (confirms it's really you)</Label>
                <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="current-password" />
              </div>
              {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={closeResetDialog} disabled={resetBusy}>
                Cancel
              </Button>
              <Button onClick={handleReset} disabled={resetBusy || newPassword.length < 6 || !adminPassword}>
                {resetBusy ? "Resetting..." : "Reset password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {canImpersonate && (
        <Dialog open={!!impersonateTarget} onOpenChange={(o) => !o && closeImpersonateDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Sign in as {impersonateTarget ? formatCadetName(impersonateTarget) : ""}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This browser will be signed in as them immediately -- their password is never touched or shown. To get back to your own account, sign out
                and log back in with your own credentials.
              </p>
              <div className="grid gap-1.5">
                <Label>Your password (confirms it's really you)</Label>
                <Input
                  type="password"
                  value={impersonatePassword}
                  onChange={(e) => setImpersonatePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {impersonateError && <p className="text-sm text-destructive">{impersonateError}</p>}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={closeImpersonateDialog} disabled={impersonating}>
                Cancel
              </Button>
              <Button onClick={handleImpersonate} disabled={impersonating || !impersonatePassword}>
                {impersonating ? "Signing in..." : "Sign in as them"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
