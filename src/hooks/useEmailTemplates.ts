import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const COLLECTION = "emailTemplates";

export interface EmailTemplate {
  id: string;
  subject: string;
  body: string;
}

/** Read by the Cloud Functions -- a doc here overrides that template's built-in default; deleting all fields (Reset to default) is done by writing the default back rather than deleting the doc, so history/edits stay simple. */
export function useEmailTemplates() {
  const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      const map: Record<string, EmailTemplate> = {};
      for (const d of snap.docs) {
        const data = d.data();
        map[d.id] = { id: d.id, subject: (data.subject as string) ?? "", body: (data.body as string) ?? "" };
      }
      setTemplates(map);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email templates.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const saveTemplate = useCallback(
    async (id: string, subject: string, body: string) => {
      await setDoc(doc(db, COLLECTION, id), { subject, body, updatedAt: serverTimestamp() });
      await refetch(true);
    },
    [refetch]
  );

  return { templates, loading, error, refetch, saveTemplate };
}
