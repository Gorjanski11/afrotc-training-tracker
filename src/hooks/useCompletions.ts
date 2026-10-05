import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
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
  partial: boolean;
  notCovered: boolean;
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
    pmtEventId: (data.pmtEventId as string | null | undefined) ?? undefined,
    partial: (data.partial as boolean | undefined) ?? false,
    notCovered: (data.notCovered as boolean | undefined) ?? false,
  };
}

export function useCompletions() {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // `silent` skips the loading flip -- without it, a bulk save (Quick Log's multi-cadet "Save
  // Changes", or CompletionEntryDialog's multi-cadet Partial complete) that calls createCompletion
  // once per pending entry would flip `loading` true/false on every single entry, unmounting the
  // whole grid to its skeleton and back N times in a row during one Save click -- on a phone this is
  // slow enough to look like the app crashed. Mirrors the same fix already applied to
  // useAttendance/useAbsenceMemoAssignments.
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setCompletions(snap.docs.map((d) => mapCompletion(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load completions.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // `opts.refetch === false` lets a bulk-save loop (same two call sites as above) skip the
  // per-write refetch entirely and do exactly one at the end instead of one full-collection
  // `getDocs` + full re-render per pending entry -- the other half of the same fix.
  const createCompletion = useCallback(
    async (input: CompletionInput, opts?: { refetch?: boolean }) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...sanitizeForFirestore(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      if (opts?.refetch !== false) await refetch(true);
      return { id: ref.id, ...input } satisfies Completion;
    },
    [refetch]
  );

  const updateCompletion = useCallback(
    async (id: string, input: CompletionInput, opts?: { refetch?: boolean }) => {
      await updateDoc(doc(db, COLLECTION, id), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      if (opts?.refetch !== false) await refetch(true);
      return { id, ...input } satisfies Completion;
    },
    [refetch]
  );

  const deleteCompletion = useCallback(
    async (id: string, opts?: { refetch?: boolean }) => {
      await deleteDoc(doc(db, COLLECTION, id));
      if (opts?.refetch !== false) await refetch(true);
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
