import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import type { DeviationMemoStatus } from "../domain/constants";
import type { DeviationMemo } from "../domain/types";

const COLLECTION = "deviationMemos";

export interface DeviationMemoInput {
  cadetId: string;
  cadetName: string;
  assignedBy: string;
  reason: string;
  dateAssigned: string;
  dueDate: string | undefined;
  status: DeviationMemoStatus;
  pdfUrl: string | undefined;
  pdfFileName: string | undefined;
  submittedAt: string | undefined;
  reviewedAt: string | undefined;
  reviewedBy: string | undefined;
  reviewNotes: string;
}

function mapMemo(id: string, data: Record<string, unknown>): DeviationMemo {
  return {
    id,
    cadetId: (data.cadetId as string) ?? "",
    cadetName: (data.cadetName as string) ?? "",
    assignedBy: (data.assignedBy as string) ?? "",
    reason: (data.reason as string) ?? "",
    dateAssigned: (data.dateAssigned as string) ?? "",
    dueDate: (data.dueDate as string | null | undefined) ?? undefined,
    status: ((data.status as DeviationMemoStatus) ?? "Assigned") as DeviationMemoStatus,
    pdfUrl: (data.pdfUrl as string | null | undefined) ?? undefined,
    pdfFileName: (data.pdfFileName as string | null | undefined) ?? undefined,
    submittedAt: (data.submittedAt as string | null | undefined) ?? undefined,
    reviewedAt: (data.reviewedAt as string | null | undefined) ?? undefined,
    reviewedBy: (data.reviewedBy as string | null | undefined) ?? undefined,
    reviewNotes: (data.reviewNotes as string) ?? "",
  };
}

export function useDeviationMemos() {
  const [memos, setMemos] = useState<DeviationMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setMemos(snap.docs.map((d) => mapMemo(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deviation memos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createMemo = useCallback(
    async (input: DeviationMemoInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...sanitizeForFirestore(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch(true);
      return { id: ref.id, ...input } satisfies DeviationMemo;
    },
    [refetch]
  );

  const updateMemo = useCallback(
    async (id: string, input: Partial<DeviationMemoInput>) => {
      await updateDoc(doc(db, COLLECTION, id), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      await refetch(true);
    },
    [refetch]
  );

  return { memos, loading, error, refetch, createMemo, updateMemo };
}
