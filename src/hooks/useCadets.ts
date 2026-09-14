import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { AsClass, CadetStatus, DevLevel } from "../domain/constants";
import type { Cadet } from "../domain/types";

export interface CadetInput {
  name: string;
  asClass: AsClass;
  devLevel: DevLevel;
  status: CadetStatus;
  notes: string;
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
  };
}

export function useCadets() {
  const [cadets, setCadets] = useState<Cadet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setCadets(snap.docs.map((d) => mapCadet(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cadets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createCadet = useCallback(
    async (input: CadetInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch();
      return { id: ref.id, ...input } satisfies Cadet;
    },
    [refetch]
  );

  const updateCadet = useCallback(
    async (id: string, input: CadetInput) => {
      await updateDoc(doc(db, COLLECTION, id), { ...input, updatedAt: serverTimestamp() });
      await refetch();
      return { id, ...input } satisfies Cadet;
    },
    [refetch]
  );

  const deleteCadet = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, COLLECTION, id));
      await refetch();
    },
    [refetch]
  );

  return { cadets, loading, error, refetch, createCadet, updateCadet, deleteCadet };
}
