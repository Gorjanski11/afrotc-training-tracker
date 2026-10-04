import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export interface MaintenanceDoc {
  enabledAt: string;
  /** null = indefinite (manual toggle, stays on until explicitly disabled). */
  until: string | null;
}

/**
 * Site-wide maintenance mode (Settings, Cortes Garay only). Reading is public (same open-read
 * Firestore rule as everything else) so even a signed-out visitor's App.tsx can show the lockout;
 * writing is restricted server-side to Cortes Garay's own email (firestore.rules), a real boundary
 * since a client-side-only check here would let anyone with dev tools flip it back off.
 *
 * A timed window is never written back to "off" when it elapses -- `inEffect` just stops reading
 * true once `until` is in the past, so there's nothing to clean up and nothing that can drift out of
 * sync with a client's clock in a way that matters (a few seconds either way is fine here).
 */
export function useMaintenanceMode() {
  const [doc_, setDoc_] = useState<MaintenanceDoc | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "siteConfig", "maintenance"), (snap) => {
      setDoc_(snap.exists() ? (snap.data() as MaintenanceDoc) : undefined);
      setLoading(false);
    });
    return unsub;
  }, []);

  const inEffect = !!doc_ && (doc_.until === null || Date.now() < new Date(doc_.until).getTime());

  const enableIndefinite = async () => {
    await setDoc(doc(db, "siteConfig", "maintenance"), { enabledAt: new Date().toISOString(), until: null });
  };
  const enableForMinutes = async (minutes: number) => {
    const now = Date.now();
    await setDoc(doc(db, "siteConfig", "maintenance"), { enabledAt: new Date(now).toISOString(), until: new Date(now + minutes * 60_000).toISOString() });
  };
  const disable = async () => {
    await deleteDoc(doc(db, "siteConfig", "maintenance"));
  };

  return { doc: doc_, inEffect, loading, enableIndefinite, enableForMinutes, disable };
}
