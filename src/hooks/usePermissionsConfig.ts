import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import type { PermissionsConfig } from "../domain/types";

const DOC_PATH = ["permissionsConfig", "global"] as const;

/**
 * Sensible empty shape used until the real doc loads (or if it's never been created yet) -- every
 * access.ts function that reads a `PermissionsConfig` field treats an empty string/array as "nobody
 * configured," which is the same as today's pre-migration behavior, never a crash.
 */
const EMPTY_CONFIG: PermissionsConfig = {
  groupCommanderEmail: { OG: "", MSG: "", WSG: "", TRG: "", CWL: "" },
  flightCommanderEmail: { P: "", M: "", N: "", O: "" },
  asClassInstructorEmail: { AS100: "", AS200: "", AS300: "", AS400: "" },
  generalAbsenceReviewerEmail: "",
  eventEditOverrideEmails: [],
  rootEmail: "",
  ofcEmail: "",
};

/**
 * Settings -> Permissions' global/structural tables (Section 3-5 of that plan) -- one Firestore doc,
 * loaded once per session like every other collection hook in this app (useCadets, useAbsenceMemos),
 * not a realtime listener -- a permissions change is rare enough that requiring the affected session
 * to refresh is fine, same as every roster-driven access change already required before this shipped.
 */
export function usePermissionsConfig() {
  const [config, setConfig] = useState<PermissionsConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDoc(doc(db, ...DOC_PATH));
      setConfig(snap.exists() ? { ...EMPTY_CONFIG, ...(snap.data() as Partial<PermissionsConfig>) } : EMPTY_CONFIG);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load permissions config.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateConfig = useCallback(
    async (input: Partial<PermissionsConfig>) => {
      await setDoc(doc(db, ...DOC_PATH), sanitizeForFirestore(input), { merge: true });
      await refetch(true);
    },
    [refetch]
  );

  return { config, loading, error, refetch, updateConfig };
}
