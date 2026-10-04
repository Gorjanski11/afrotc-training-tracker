import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { useMaintenanceMode } from "../../hooks/useMaintenanceMode";

const DURATIONS = [
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
];

/** Cortes Garay only -- blocks every other signed-in user out of the whole app (App.tsx) with a message, while he keeps normal access and can turn it off early. */
export function MaintenanceScreen() {
  const { doc, inEffect, loading, enableIndefinite, enableForMinutes, disable } = useMaintenanceMode();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-2xl font-semibold">
        <Wrench className="h-5 w-5 text-primary" />
        Maintenance Mode
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Blocks everyone except you out of the site with a message, so you can fix bugs or make changes without anyone else mid-action. You always keep
        normal access and can turn it off early at any time.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Status
                {inEffect ? <Badge variant="destructive">Active</Badge> : <Badge variant="success">Off</Badge>}
              </CardTitle>
              {inEffect && doc && (
                <CardDescription>
                  Enabled {new Date(doc.enabledAt).toLocaleString()}
                  {doc.until ? ` — until ${new Date(doc.until).toLocaleString()}` : " — indefinitely, until you turn it off"}.
                </CardDescription>
              )}
            </CardHeader>
            {inEffect && (
              <CardContent>
                <Button variant="destructive" disabled={busy} onClick={() => run(disable)}>
                  {busy ? "Turning off..." : "Turn off now"}
                </Button>
              </CardContent>
            )}
          </Card>

          {!inEffect && (
            <Card>
              <CardHeader>
                <CardTitle>Turn it on</CardTitle>
                <CardDescription>Starts immediately. Pick a duration (auto-turns off on its own), or turn it on indefinitely.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <Button key={d.minutes} variant="outline" disabled={busy} onClick={() => run(() => enableForMinutes(d.minutes))}>
                    {d.label}
                  </Button>
                ))}
                <Button variant="destructive" disabled={busy} onClick={() => run(enableIndefinite)}>
                  Indefinitely
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
