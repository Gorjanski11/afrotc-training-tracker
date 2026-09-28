import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserCog, KeyRound, Copy, Check, Dices } from "lucide-react";
import { resolveTabAccess, isCadreOrCortesGaray } from "../../domain/access";
import { compareByLastName, formatCadetName } from "../../domain/nameUtils";
import type { Cadet } from "../../domain/types";
import type { CadetInput } from "../../hooks/useCadets";

interface Props {
  roster: Cadet[];
  updateCadetFields: (id: string, input: Partial<CadetInput>) => Promise<void>;
  userEmail: string | null | undefined;
  reauthenticate: (password: string) => Promise<void>;
  resetOtherPassword: (targetEmail: string, newPassword: string) => Promise<void>;
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
 * Section 6.1 -- gated to the whole ALL_ACCESS tier. Since there's no client-side way to enumerate
 * raw Firebase Auth accounts without the Admin SDK, "managing accounts" here means the roster-driven
 * part of access (email/isCadre/position/group/flight, which `resolveTabAccess`'s fallback reads)
 * plus a transparent view of what each person currently resolves to. Password reset lives here too
 * (merged from its own tab) but is gated narrower -- only Cadre/Cortes Garay ever see the button,
 * even though Saltiel/Mo Velez (also ALL_ACCESS) can see everything else on this screen.
 */
export function AccountManagerScreen({ roster, updateCadetFields, userEmail, reauthenticate, resetOtherPassword }: Props) {
  const [search, setSearch] = useState("");
  const canResetPasswords = isCadreOrCortesGaray(userEmail, roster);

  const [target, setTarget] = useState<Cadet | undefined>();
  const [newPassword, setNewPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [justReset, setJustReset] = useState<{ name: string; password: string } | undefined>();
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return roster
      .filter((p) => query === "" || p.name.toLowerCase().includes(query) || (p.email ?? "").toLowerCase().includes(query))
      .sort((a, b) => compareByLastName(a.name, b.name));
  }, [roster, search]);

  const openFor = (cadet: Cadet) => {
    setTarget(cadet);
    setNewPassword(generatePassword());
    setAdminPassword("");
    setError(undefined);
  };

  const closeDialog = () => {
    setTarget(undefined);
    setNewPassword("");
    setAdminPassword("");
    setError(undefined);
  };

  const handleReset = async () => {
    if (!target?.email || newPassword.length < 6 || !adminPassword) return;
    setBusy(true);
    setError(undefined);
    try {
      await reauthenticate(adminPassword);
      await resetOtherPassword(target.email, newPassword);
      await updateCadetFields(target.id, { mustChangePassword: true });
      setJustReset({ name: formatCadetName(target), password: newPassword });
      setCopied(false);
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset -- check your own password and try again.");
    } finally {
      setBusy(false);
    }
  };

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
        {canResetPasswords && " You can also reset anyone's password here if they get locked out -- that always requires your own current password first."}
      </p>

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
                  <TableHead>Rank</TableHead>
                  <TableHead>Cadre</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Resolved access</TableHead>
                  {canResetPasswords && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{formatCadetName(p)}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.email ?? "—"}</TableCell>
                    <TableCell>
                      {p.isCadre ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Input
                          defaultValue={p.rank ?? ""}
                          placeholder="e.g. 2d Lt"
                          className="h-8 w-28"
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (value !== (p.rank ?? "")) updateCadetFields(p.id, { rank: value === "" ? undefined : value });
                          }}
                        />
                      )}
                    </TableCell>
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
                    {canResetPasswords && (
                      <TableCell>
                        {p.email && (
                          <Button variant="outline" size="sm" onClick={() => openFor(p)}>
                            <KeyRound className="h-3.5 w-3.5" />
                            Reset password
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canResetPasswords ? 7 : 6} className="text-center text-muted-foreground">
                      No one matches this search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canResetPasswords && (
        <Dialog open={!!target} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reset password for {target ? formatCadetName(target) : ""}</DialogTitle>
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
                <p className="text-xs text-muted-foreground">At least 6 characters. Give this to {target?.name.split(",")[0] ?? "them"} directly.</p>
              </div>
              <div className="grid gap-1.5">
                <Label>Your password (confirms it's really you)</Label>
                <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="current-password" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={closeDialog} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={handleReset} disabled={busy || newPassword.length < 6 || !adminPassword}>
                {busy ? "Resetting..." : "Reset password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
