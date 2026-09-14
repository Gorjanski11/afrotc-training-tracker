import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { PmtEventType } from "../domain/constants";
import type { PmtEvent } from "../domain/types";

export interface PmtEventInput {
  title: string;
  eventDate: string;
  eventType: PmtEventType;
  location: string;
  pocic: string;
  pocic2: string;
  pocic3: string;
  pocsup: string;
  trainingWeek: number | undefined;
  objectiveIds: string[];
  notes: string;
}

const COLLECTION = "pmtEvents";

function mapPmtEvent(id: string, data: Record<string, unknown>): PmtEvent {
  return {
    id,
    title: (data.title as string) ?? "",
    eventDate: (data.eventDate as string) ?? "",
    eventType: ((data.eventType as PmtEventType) ?? "LLAB") as PmtEventType,
    location: (data.location as string) ?? "",
    pocic: (data.pocic as string) ?? "",
    pocic2: (data.pocic2 as string) ?? "",
    pocic3: (data.pocic3 as string) ?? "",
    pocsup: (data.pocsup as string) ?? "",
    trainingWeek: data.trainingWeek as number | undefined,
    objectiveIds: (data.objectiveIds as string[]) ?? [],
    notes: (data.notes as string) ?? "",
  };
}

export function usePmtEvents() {
  const [events, setEvents] = useState<PmtEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setEvents(snap.docs.map((d) => mapPmtEvent(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load PMT events.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createEvent = useCallback(
    async (input: PmtEventInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch();
      return { id: ref.id, ...input } satisfies PmtEvent;
    },
    [refetch]
  );

  const updateEvent = useCallback(
    async (id: string, input: PmtEventInput) => {
      await updateDoc(doc(db, COLLECTION, id), { ...input, updatedAt: serverTimestamp() });
      await refetch();
      return { id, ...input } satisfies PmtEvent;
    },
    [refetch]
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, COLLECTION, id));
      await refetch();
    },
    [refetch]
  );

  return { events, loading, error, refetch, createEvent, updateEvent, deleteEvent };
}
