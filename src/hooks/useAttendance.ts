import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import type { AbsenceReason, AttendanceStatus } from "../domain/constants";
import type { Attendance } from "../domain/types";

const COLLECTION = "attendance";

export interface AttendanceInput {
  cadetId: string;
  pmtEventId: string;
  status: AttendanceStatus;
  absenceReason: AbsenceReason | undefined;
  recordedAt: string;
  notes: string;
}

function mapAttendance(id: string, data: Record<string, unknown>): Attendance {
  return {
    id,
    cadetId: (data.cadetId as string) ?? "",
    pmtEventId: (data.pmtEventId as string) ?? "",
    status: ((data.status as AttendanceStatus) ?? "P") as AttendanceStatus,
    absenceReason: (data.absenceReason as AbsenceReason | null | undefined) ?? undefined,
    recordedAt: (data.recordedAt as string) ?? "",
    notes: (data.notes as string) ?? "",
  };
}

/** Post-Accountability (Section 4.1) -- one record per cadet per PMT. */
export function useAttendance() {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // `silent` skips the loading flip -- the hub swaps to a full-page skeleton while any hook is
  // loading, which would otherwise unmount the Accountability screen mid-Save every time a
  // per-cadet write in that loop triggers its own post-write refetch.
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setAttendance(snap.docs.map((d) => mapAttendance(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createAttendance = useCallback(
    async (input: AttendanceInput) => {
      const ref = await addDoc(collection(db, COLLECTION), { ...sanitizeForFirestore(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch(true);
      return { id: ref.id, ...input } satisfies Attendance;
    },
    [refetch]
  );

  const updateAttendance = useCallback(
    async (id: string, input: AttendanceInput) => {
      await updateDoc(doc(db, COLLECTION, id), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      await refetch(true);
    },
    [refetch]
  );

  return { attendance, loading, error, refetch, createAttendance, updateAttendance };
}
