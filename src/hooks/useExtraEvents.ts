import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import type { ExtraEventType } from "../domain/constants";
import type { ExtraEvent } from "../domain/types";

const COLLECTION = "extraEvents";

export interface ExtraEventInput {
  title: string;
  eventDate: string;
  eventType: ExtraEventType;
  location: string;
  pocic: string;
  notes: string;
  repositionsPmtEventId: string | undefined;
}

function mapEvent(id: string, data: Record<string, unknown>): ExtraEvent {
  return {
    id,
    title: (data.title as string) ?? "",
    eventDate: (data.eventDate as string) ?? "",
    eventType: ((data.eventType as ExtraEventType) ?? "Bonding") as ExtraEventType,
    location: (data.location as string) ?? "",
    pocic: (data.pocic as string) ?? "",
    notes: (data.notes as string) ?? "",
    repositionsPmtEventId: (data.repositionsPmtEventId as string | null | undefined) ?? undefined,
  };
}

export function useExtraEvents() {
  const [extraEvents, setExtraEvents] = useState<ExtraEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setExtraEvents(snap.docs.map((d) => mapEvent(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load extra events.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createExtraEvent = useCallback(
    async (input: ExtraEventInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...sanitizeForFirestore(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch(true);
      return { id: ref.id, ...input } satisfies ExtraEvent;
    },
    [refetch]
  );

  const updateExtraEvent = useCallback(
    async (id: string, input: ExtraEventInput) => {
      await updateDoc(doc(db, COLLECTION, id), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      await refetch(true);
    },
    [refetch]
  );

  const deleteExtraEvent = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, COLLECTION, id));
      await refetch(true);
    },
    [refetch]
  );

  return { extraEvents, loading, error, refetch, createExtraEvent, updateExtraEvent, deleteExtraEvent };
}
