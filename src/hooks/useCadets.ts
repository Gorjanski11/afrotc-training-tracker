import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import type { AsClass, CadetStatus, DevLevel, Flight, Group } from "../domain/constants";
import type { Cadet } from "../domain/types";

export interface CadetInput {
  name: string;
  asClass: AsClass;
  devLevel: DevLevel;
  status: CadetStatus;
  notes: string;
  email: string;
  flight: Flight | undefined;
  group: Group | undefined;
  isCadre: boolean;
  position: string | undefined;
  statusChangedDate: string | undefined;
}

const COLLECTION = "cadets";

function mapCadet(id: string, data: Record<string, unknown>): Cadet {
  return {
    id,
    name: (data.name as string) ?? "",
    asClass: data.asClass as AsClass | undefined,
    devLevel: data.devLevel as DevLevel | undefined,
    status: data.status as CadetStatus | undefined,
    notes: (data.notes as string) ?? "",
    email: (data.email as string | null | undefined) ?? undefined,
    flight: (data.flight as Flight | null | undefined) ?? undefined,
    group: (data.group as Group | null | undefined) ?? undefined,
    isCadre: (data.isCadre as boolean | undefined) ?? false,
    position: (data.position as string | null | undefined) ?? undefined,
    statusChangedDate: (data.statusChangedDate as string | null | undefined) ?? undefined,
  };
}

export function useCadets() {
  const [cadets, setCadets] = useState<Cadet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // `silent` skips the loading flip -- with this hook now shared across every tab in the hub, a
  // loud refetch after a write in one tab would flip a shared `loading` state read by other tabs
  // too, unmounting whatever screen is mid-write elsewhere. Same fix already applied to every
  // other write hook in this ecosystem.
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setCadets(snap.docs.map((d) => mapCadet(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cadets.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createCadet = useCallback(
    async (input: CadetInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...sanitizeForFirestore(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch(true);
      return { id: ref.id, ...input } satisfies Cadet;
    },
    [refetch]
  );

  const updateCadet = useCallback(
    async (id: string, input: CadetInput) => {
      await updateDoc(doc(db, COLLECTION, id), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      await refetch(true);
      return { id, ...input } satisfies Cadet;
    },
    [refetch]
  );

  /** Partial update for the fields Accountability's Roster screen owns (isCadre/group/position/statusChangedDate/status) -- never touches name/asClass/devLevel/email, which the TO's Roster screen owns. */
  const updateCadetFields = useCallback(
    async (id: string, input: Partial<CadetInput>) => {
      await updateDoc(doc(db, COLLECTION, id), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      await refetch(true);
    },
    [refetch]
  );

  const deleteCadet = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, COLLECTION, id));
      await refetch(true);
    },
    [refetch]
  );

  return { cadets, loading, error, refetch, createCadet, updateCadet, updateCadetFields, deleteCadet };
}
