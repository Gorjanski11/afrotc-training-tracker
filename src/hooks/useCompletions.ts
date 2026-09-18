import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ProficiencyCode } from "../domain/constants";
import type { Completion } from "../domain/types";

export interface CompletionInput {
  cadetId: string;
  cadetName: string;
  objectiveId: string;
  objectiveNumber: string;
  proficiencyAchieved: ProficiencyCode;
  dateCompleted: string;
  evaluator: string;
  notes: string;
  pmtEventId: string | undefined;
}

const COLLECTION = "completions";

function mapCompletion(id: string, data: Record<string, unknown>): Completion {
  return {
    id,
    cadetId: (data.cadetId as string) ?? "",
    cadetName: (data.cadetName as string) ?? "",
    objectiveId: (data.objectiveId as string) ?? "",
    objectiveNumber: (data.objectiveNumber as string) ?? "",
    proficiencyAchieved: ((data.proficiencyAchieved as ProficiencyCode) ?? "Ka") as ProficiencyCode,
    dateCompleted: data.dateCompleted as string | undefined,
    evaluator: (data.evaluator as string) ?? "",
    notes: (data.notes as string) ?? "",
    pmtEventId: data.pmtEventId as string | undefined,
  };
}

export function useCompletions() {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setCompletions(snap.docs.map((d) => mapCompletion(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load completions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createCompletion = useCallback(
    async (input: CompletionInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch();
      return { id: ref.id, ...input } satisfies Completion;
    },
    [refetch]
  );

  const updateCompletion = useCallback(
    async (id: string, input: CompletionInput) => {
      await updateDoc(doc(db, COLLECTION, id), { ...input, updatedAt: serverTimestamp() });
      await refetch();
      return { id, ...input } satisfies Completion;
    },
    [refetch]
  );

  const deleteCompletion = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, COLLECTION, id));
      await refetch();
    },
    [refetch]
  );

  /** Cascade-delete every completion for a cadet (used before deleting the cadet itself). */
  const deleteCompletionsForCadet = useCallback(async (cadetId: string) => {
    const snap = await getDocs(query(collection(db, COLLECTION), where("cadetId", "==", cadetId)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await refetch();
  }, [refetch]);

  return { completions, loading, error, refetch, createCompletion, updateCompletion, deleteCompletion, deleteCompletionsForCadet };
}
