import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import type { AbsenceAsClass, AbsenceMemoStatus, AbsenceReason, Instructor } from "../domain/constants";
import type { AbsenceMemo } from "../domain/types";

const COLLECTION = "absenceMemos";

export interface AbsenceMemoInput {
  cadetId: string;
  cadetName: string;
  pmtEventIds: string[];
  attendanceIds: string[];
  assignedAt: string | undefined;
  asClass: AbsenceAsClass | undefined;
  classDate: string | undefined;
  classTitle: string | undefined;
  instructor: Instructor | undefined;
  reason: AbsenceReason;
  medicalDocSent: boolean;
  pdfUrl: string | undefined;
  pdfFileName: string | undefined;
  status: AbsenceMemoStatus;
  submittedAt: string;
  reviewedAt: string | undefined;
  reviewedBy: string | undefined;
  reviewNotes: string;
  returnReason: string | undefined;
  attendanceUpdatedAt: string | undefined;
}

function mapMemo(id: string, data: Record<string, unknown>): AbsenceMemo {
  return {
    id,
    cadetId: (data.cadetId as string) ?? "",
    cadetName: (data.cadetName as string) ?? "",
    pmtEventIds: (data.pmtEventIds as string[]) ?? [],
    attendanceIds: (data.attendanceIds as string[]) ?? [],
    assignedAt: (data.assignedAt as string | null | undefined) ?? undefined,
    asClass: (data.asClass as AbsenceAsClass | null | undefined) ?? undefined,
    classDate: (data.classDate as string | null | undefined) ?? undefined,
    classTitle: (data.classTitle as string | null | undefined) ?? undefined,
    instructor: (data.instructor as Instructor | null | undefined) ?? undefined,
    reason: ((data.reason as AbsenceReason) ?? "Other") as AbsenceReason,
    medicalDocSent: (data.medicalDocSent as boolean) ?? false,
    pdfUrl: (data.pdfUrl as string | null | undefined) ?? undefined,
    pdfFileName: (data.pdfFileName as string | null | undefined) ?? undefined,
    status: ((data.status as AbsenceMemoStatus) ?? "Pending") as AbsenceMemoStatus,
    submittedAt: (data.submittedAt as string) ?? "",
    reviewedAt: (data.reviewedAt as string | null | undefined) ?? undefined,
    reviewedBy: (data.reviewedBy as string | null | undefined) ?? undefined,
    reviewNotes: (data.reviewNotes as string) ?? "",
    returnReason: (data.returnReason as string | null | undefined) ?? undefined,
    attendanceUpdatedAt: (data.attendanceUpdatedAt as string | null | undefined) ?? undefined,
  };
}

export function useAbsenceMemos() {
  const [memos, setMemos] = useState<AbsenceMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // `silent` skips the loading flip -- App.tsx swaps to a full-page skeleton while any hook is
  // loading, which would otherwise unmount whichever screen is mid-review the moment its own
  // post-write refetch starts.
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setMemos(snap.docs.map((d) => mapMemo(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load absence memos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createMemo = useCallback(
    async (input: AbsenceMemoInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...sanitizeForFirestore(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch(true);
      return { id: ref.id, ...input } satisfies AbsenceMemo;
    },
    [refetch]
  );

  const updateMemo = useCallback(
    async (id: string, input: Partial<AbsenceMemoInput>) => {
      await updateDoc(doc(db, COLLECTION, id), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      await refetch(true);
    },
    [refetch]
  );

  const deleteMemo = useCallback(
    async (id: string) => {
      await deleteDoc(doc(db, COLLECTION, id));
      await refetch(true);
    },
    [refetch]
  );

  return { memos, loading, error, refetch, createMemo, updateMemo, deleteMemo };
}
