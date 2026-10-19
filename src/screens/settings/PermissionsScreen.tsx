import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, ShieldCheck, ShieldAlert, Pencil, Trash2 } from "lucide-react";
import { FLIGHTS, GROUPS, type Flight, type Group } from "../../domain/constants";
import { excludeInactive } from "../../domain/access";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import { PersonCombobox } from "../../components/memoReview/PersonCombobox";
import { PersonMultiCombobox } from "../../components/memoReview/PersonMultiCombobox";
import type {
  AccessOverride,
  AccessTierKind,
  Cadet,
  DeviationAssignOverrideInput,
  DeviationScopeKind,
  PermissionsConfig,
  PersonRef,
} from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";

interface Props {
  roster: Cadet[];
  updateCadetFields: (id: string, input: Partial<CadetInput>) => Promise<void>;
  config: PermissionsConfig;
  updateConfig: (input: Partial<PermissionsConfig>) => Promise<void>;
  reauthenticate: (password: string) => Promise<void>;
}

const NONE = "__default__";

const TIER_LABEL: Record<AccessTierKind, string> = {
  all: "Full Access (Cadre/CWL tier)",
  toFullOnly: "TO Full Only",
  deviationOnly: "Deviation Review Only",
  pocGroup: "POC Group Commander",
  pocGroupPlusGmc: "POC Group Commander + All GMC",
  gmcFlight: "GMC Flight Commander",
  gmcWide: "GMC Wide (all flights)",
};
const TIER_NEEDS_GROUP: Set<AccessTierKind> = new Set(["pocGroup", "pocGroupPlusGmc"]);
const TIER_NEEDS_FLIGHT: Set<AccessTierKind> = new Set(["gmcFlight"]);

function tierSummary(cadet: Cadet): string {
  const o = cadet.accessOverride;
  if (o) return `${TIER_LABEL[o.tier]}${o.group ? ` (${o.group})` : ""}${o.flight ? ` (${o.flight}-FLT)` : ""}`;
  return cadet.isCadre ? "Full Access (via Cadre)" : "Cadet (default)";
}

const SCOPE_LABEL: Record<DeviationScopeKind, string> = {
  everyone: "Everyone",
  "everyone-except-cadre": "Everyone except Cadre",
  "any-gmc": "Any GMC",
  flight: "One Flight",
  group: "One Group",
  "cannot-assign": "Cannot assign",
};

function scopeSummary(o: DeviationAssignOverrideInput): string {
  const scope = SCOPE_LABEL[o.scope] + (o.group ? ` (${o.group})` : "") + (o.flight ? ` (${o.flight}-FLT)` : "");
  return `${scope}${o.reviewOwnOnly ? " · own review only" : ""}`;
}

/**
 * Settings -> Permissions (Section 16/Permissions-tab plan) -- the editable replacement for every
 * hardcoded table in domain/access.ts. Full-access-only. Six sections: Person Access (the one
 * that's actually reassigned regularly), Deviation Memo Assign Authority, Unit Responsibility,
 * Absence Memo Reviewers, Event Edit Authority, and Root/Impersonation (visually separated --
 * meaningfully more sensitive than the rest, gated behind a password re-check on save).
 */
export function PermissionsScreen({ roster, updateCadetFields, config, updateConfig, reauthenticate }: Props) {
  const activeRoster = useMemo(() => excludeInactive(roster), [roster]);
  const sortedRoster = useMemo(() => [...activeRoster].sort((a, b) => compareByLastName(a.name, b.name)), [activeRoster]);

  // -- Section 1: Person Access --
  const [search, setSearch] = useState("");
  const [editingCadet, setEditingCadet] = useState<Cadet | undefined>();
  const [tier, setTier] = useState<AccessTierKind | typeof NONE>(NONE);
  const [tierGroup, setTierGroup] = useState<Group>("OG");
  const [tierFlight, setTierFlight] = useState<Flight>("M");

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedRoster.filter((p) => q === "" || p.name.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q));
  }, [sortedRoster, search]);

  const openAccessEdit = (cadet: Cadet) => {
    setEditingCadet(cadet);
    setTier(cadet.accessOverride?.tier ?? NONE);
    setTierGroup(cadet.accessOverride?.group ?? "OG");
    setTierFlight(cadet.accessOverride?.flight ?? "M");
  };

  const saveAccessEdit = async () => {
    if (!editingCadet) return;
    const override: AccessOverride | undefined =
      tier === NONE
        ? undefined
        : {
            tier,
            group: TIER_NEEDS_GROUP.has(tier) ? tierGroup : undefined,
            flight: TIER_NEEDS_FLIGHT.has(tier) ? tierFlight : undefined,
          };
    await updateCadetFields(editingCadet.id, { accessOverride: override });
    setEditingCadet(undefined);
  };

  // -- Section 2: Deviation Memo Assign Authority --
  const [addingDeviationFor, setAddingDeviationFor] = useState("");
  const [editingDeviationCadet, setEditingDeviationCadet] = useState<Cadet | undefined>();
  const [devScope, setDevScope] = useState<DeviationScopeKind>("everyone");
  const [devGroup, setDevGroup] = useState<Group>("OG");
  const [devFlight, setDevFlight] = useState<Flight>("M");
  const [devReviewOwnOnly, setDevReviewOwnOnly] = useState(true);
  const [devAlsoVisible, setDevAlsoVisible] = useState<PersonRef[]>([]);

  const deviationOverrideRows = useMemo(() => sortedRoster.filter((c) => !!c.deviationAssignOverride), [sortedRoster]);

  const openDeviationEdit = (cadet: Cadet) => {
    setEditingDeviationCadet(cadet);
    const o = cadet.deviationAssignOverride;
    setDevScope(o?.scope ?? "everyone");
    setDevGroup(o?.group ?? "OG");
    setDevFlight(o?.flight ?? "M");
    setDevReviewOwnOnly(o?.reviewOwnOnly ?? true);
    setDevAlsoVisible((o?.alsoVisibleEmails ?? []).map((email) => ({ email, name: roster.find((c) => c.email === email)?.name ?? email })));
  };

  const saveDeviationEdit = async () => {
    if (!editingDeviationCadet) return;
    const override: DeviationAssignOverrideInput = {
      scope: devScope,
      group: devScope === "group" ? devGroup : undefined,
      flight: devScope === "flight" ? devFlight : undefined,
      reviewOwnOnly: devReviewOwnOnly,
      alsoVisibleEmails: devAlsoVisible.length > 0 ? devAlsoVisible.map((p) => p.email) : undefined,
    };
    await updateCadetFields(editingDeviationCadet.id, { deviationAssignOverride: override });
    setEditingDeviationCadet(undefined);
  };

  const removeDeviationOverride = async (cadet: Cadet) => {
    await updateCadetFields(cadet.id, { deviationAssignOverride: undefined });
  };

  // -- Section 6: Root/Impersonation -- the one save gated behind a password re-check.
  const [rootEditOpen, setRootEditOpen] = useState(false);
  const [pendingRootEmail, setPendingRootEmail] = useState("");
  const [rootPassword, setRootPassword] = useState("");
  const [rootSaving, setRootSaving] = useState(false);
  const [rootError, setRootError] = useState<string | undefined>();

  const openRootEdit = () => {
    setPendingRootEmail(config.rootEmail);
    setRootPassword("");
    setRootError(undefined);
    setRootEditOpen(true);
  };
  const saveRootEmail = async () => {
    if (!rootPassword) return;
    setRootSaving(true);
    setRootError(undefined);
    try {
      await reauthenticate(rootPassword);
      await updateConfig({ rootEmail: pendingRootEmail });
      setRootEditOpen(false);
    } catch (e) {
      setRootError(e instanceof Error ? e.message : "Failed to save -- check your own password and try again.");
    } finally {
      setRootSaving(false);
    }
  };

  const eventEditPeople: PersonRef[] = config.eventEditOverrideEmails.map((email) => ({
    email,
    name: roster.find((c) => c.email === email)?.name ?? email,
  }));

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <ShieldCheck className="h-5 w-5 text-primary" />
        Permissions
      </h2>
      <p className="text-sm text-muted-foreground">
        Everything here used to require a code change and a redeploy to adjust. Changes take effect immediately for anyone who signs in (or
        refreshes) after you save.
      </p>

      {/* Section 1: Person Access */}
      <Card>
        <CardHeader>
          <CardTitle>Person Access</CardTitle>
          <CardDescription>Who gets which tab-access tier -- the one you'll actually touch most (new Flight/Group Commander, etc).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or email..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-96 overflow-auto rounded-md border border-input">
            <Table aria-label="Person access">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Resolved tier</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoster.map((cadet) => (
                  <TableRow key={cadet.id}>
                    <TableCell className="whitespace-nowrap">{formatCadetName(cadet)}</TableCell>
                    <TableCell className="whitespace-nowrap">{cadet.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={cadet.accessOverride ? "outline" : "secondary"}>{tierSummary(cadet)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openAccessEdit(cadet)} aria-label="Edit access">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRoster.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No one matches this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Deviation Memo Assign Authority */}
      <Card>
        <CardHeader>
          <CardTitle>Deviation Memo Assign Authority</CardTitle>
          <CardDescription>Who can assign a Deviation Memo, to whom, and whether they only review their own.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <PersonCombobox
              people={activeRoster}
              value={addingDeviationFor}
              onChange={(email) => {
                const cadet = roster.find((c) => c.email === email);
                if (cadet) openDeviationEdit(cadet);
                setAddingDeviationFor("");
              }}
              placeholder="Add an override for..."
            />
          </div>
          <div className="overflow-auto rounded-md border border-input">
            <Table aria-label="Deviation assign overrides">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Also visible to</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviationOverrideRows.map((cadet) => (
                  <TableRow key={cadet.id}>
                    <TableCell className="whitespace-nowrap">{formatCadetName(cadet)}</TableCell>
                    <TableCell>{scopeSummary(cadet.deviationAssignOverride!)}</TableCell>
                    <TableCell className="max-w-xs truncate">{(cadet.deviationAssignOverride!.alsoVisibleEmails ?? []).join(", ") || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openDeviationEdit(cadet)} aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeDeviationOverride(cadet)} aria-label="Remove">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {deviationOverrideRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No one has an override -- everyone falls back to Cadre (full)/cannot-assign.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Unit Responsibility */}
      <Card>
        <CardHeader>
          <CardTitle>Unit Responsibility</CardTitle>
          <CardDescription>Who SAE Review holds responsible for each Group's/Flight's reporting.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Group Commanders</Label>
            {GROUPS.map((g) => (
              <div key={g} className="flex items-center justify-between gap-2">
                <span className="w-14 text-sm font-medium">{g}</span>
                <PersonCombobox
                  people={activeRoster}
                  value={config.groupCommanderEmail[g] ?? ""}
                  onChange={(email) => updateConfig({ groupCommanderEmail: { ...config.groupCommanderEmail, [g]: email } })}
                  className="w-full"
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Flight Commanders</Label>
            {FLIGHTS.map((f) => (
              <div key={f} className="flex items-center justify-between gap-2">
                <span className="w-14 text-sm font-medium">{f}-FLT</span>
                <PersonCombobox
                  people={activeRoster}
                  value={config.flightCommanderEmail[f] ?? ""}
                  onChange={(email) => updateConfig({ flightCommanderEmail: { ...config.flightCommanderEmail, [f]: email } })}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Absence Memo Reviewers */}
      <Card>
        <CardHeader>
          <CardTitle>Absence Memo Reviewers</CardTitle>
          <CardDescription>True Cadre only see the Absence Memos for their own AS-Class, except the general reviewer, who sees all.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["AS100", "AS200", "AS300", "AS400"] as const).map((as) => (
            <div key={as} className="flex items-center justify-between gap-2">
              <span className="w-16 text-sm font-medium">{as}</span>
              <PersonCombobox
                people={activeRoster}
                value={config.asClassInstructorEmail[as] ?? ""}
                onChange={(email) => updateConfig({ asClassInstructorEmail: { ...config.asClassInstructorEmail, [as]: email } })}
                className="w-full"
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="w-32 shrink-0 text-sm font-medium">General reviewer</span>
            <PersonCombobox
              people={activeRoster}
              value={config.generalAbsenceReviewerEmail}
              onChange={(email) => updateConfig({ generalAbsenceReviewerEmail: email })}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Event Edit Authority */}
      <Card>
        <CardHeader>
          <CardTitle>Event Edit Authority</CardTitle>
          <CardDescription>Who can add/edit/delete PMT and Extra Events, beyond true Cadre.</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonMultiCombobox
            people={activeRoster}
            value={eventEditPeople}
            onChange={(people) => updateConfig({ eventEditOverrideEmails: people.map((p) => p.email) })}
            placeholder="Add someone..."
          />
        </CardContent>
      </Card>

      {/* Section 6: Root / Impersonation -- deliberately separated and more guarded */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">
            <ShieldAlert className="h-4 w-4" />
            Root / Impersonation
          </CardTitle>
          <CardDescription>
            This person can impersonate any account, delete any data, and bypass maintenance mode. Changing this takes effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">
              Currently: <strong>{config.rootEmail || "(not set)"}</strong>
            </span>
            <Button variant="outline" onClick={openRootEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Change
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* -- Dialogs -- */}

      <Dialog open={!!editingCadet} onOpenChange={(o) => !o && setEditingCadet(undefined)}>
        <DialogContent className="max-w-sm">
          {editingCadet && (
            <>
              <DialogHeader>
                <DialogTitle>Access for {formatCadetName(editingCadet)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tier</Label>
                  <Select value={tier} onValueChange={(v) => setTier(v as AccessTierKind | typeof NONE)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Default (Cadre flag or Cadet-only)</SelectItem>
                      {(Object.keys(TIER_LABEL) as AccessTierKind[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TIER_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {tier !== NONE && TIER_NEEDS_GROUP.has(tier) && (
                  <div className="space-y-1.5">
                    <Label>Group</Label>
                    <Select value={tierGroup} onValueChange={(v) => setTierGroup(v as Group)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUPS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {tier !== NONE && TIER_NEEDS_FLIGHT.has(tier) && (
                  <div className="space-y-1.5">
                    <Label>Flight</Label>
                    <Select value={tierFlight} onValueChange={(v) => setTierFlight(v as Flight)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FLIGHTS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}-FLT
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setEditingCadet(undefined)}>
                  Cancel
                </Button>
                <Button onClick={saveAccessEdit}>Save</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingDeviationCadet} onOpenChange={(o) => !o && setEditingDeviationCadet(undefined)}>
        <DialogContent className="max-w-sm">
          {editingDeviationCadet && (
            <>
              <DialogHeader>
                <DialogTitle>Deviation assign authority -- {formatCadetName(editingDeviationCadet)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Scope</Label>
                  <Select value={devScope} onValueChange={(v) => setDevScope(v as DeviationScopeKind)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SCOPE_LABEL) as DeviationScopeKind[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {SCOPE_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {devScope === "group" && (
                  <div className="space-y-1.5">
                    <Label>Group</Label>
                    <Select value={devGroup} onValueChange={(v) => setDevGroup(v as Group)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GROUPS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {devScope === "flight" && (
                  <div className="space-y-1.5">
                    <Label>Flight</Label>
                    <Select value={devFlight} onValueChange={(v) => setDevFlight(v as Flight)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FLIGHTS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}-FLT
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={devReviewOwnOnly} onChange={(e) => setDevReviewOwnOnly(e.target.checked)} />
                  Review own only (never see everyone else's)
                </label>
                <div className="space-y-1.5">
                  <Label>Also visible to (view only, e.g. Montalvo seeing every Flight Commander's memos)</Label>
                  <PersonMultiCombobox people={activeRoster} value={devAlsoVisible} onChange={setDevAlsoVisible} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setEditingDeviationCadet(undefined)}>
                  Cancel
                </Button>
                <Button onClick={saveDeviationEdit}>Save</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rootEditOpen} onOpenChange={(o) => !o && setRootEditOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change root / impersonation</DialogTitle>
            <DialogDescription>Confirms it's really you first, same as a password reset. A hardcoded safety email always keeps access too, so this can never fully lock you out.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Person</Label>
              <PersonCombobox people={activeRoster} value={pendingRootEmail} onChange={(email) => setPendingRootEmail(email)} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label>Your password (confirms it's really you)</Label>
              <Input type="password" value={rootPassword} onChange={(e) => setRootPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {rootError && <p className="text-sm text-destructive">{rootError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRootEditOpen(false)} disabled={rootSaving}>
              Cancel
            </Button>
            <Button onClick={saveRootEmail} disabled={rootSaving || !rootPassword || !pendingRootEmail}>
              {rootSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
