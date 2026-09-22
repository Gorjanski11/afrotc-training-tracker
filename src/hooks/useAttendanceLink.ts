import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const COLLECTION = "attendance";

interface AttendanceRecord {
  id: string;
  cadetId: string;
  pmtEventId: string;
  status: string;
}

function mapRecord(id: string, data: Record<string, unknown>): AttendanceRecord {
  return {
    id,
    cadetId: (data.cadetId as string) ?? "",
    pmtEventId: (data.pmtEventId as string) ?? "",
    status: (data.status as string) ?? "",
  };
}

/**
 * A narrow read/write link into the Accountability site's shared `attendance` collection (same
 * Firebase project). This site never creates or fully edits an Attendance record -- it only flips
 * the `status` field on records that already exist as "PE" (Pending Excuse) to "AE" or "A" once an
 * Absence Memo covering that PMT is decided. Every other field on the record (absenceReason,
 * recordedAt, notes) is left untouched since `updateDoc` only writes the keys given here.
 */
export function useAttendanceLink() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setRecords(snap.docs.map((d) => mapRecord(d.id, d.data())));
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

  /** Flips every PE record for this cadet across the given PMTs to `newStatus`. Records not currently PE are left alone (e.g. already resolved, or the cadet was never marked pending on that PMT). Returns how many records were actually updated. */
  const applyMemoDecision = useCallback(
    async (cadetId: string, pmtEventIds: string[], newStatus: "AE" | "A") => {
      const targets = records.filter((r) => r.cadetId === cadetId && pmtEventIds.includes(r.pmtEventId) && r.status === "PE");
      await Promise.all(targets.map((r) => updateDoc(doc(db, COLLECTION, r.id), { status: newStatus, updatedAt: serverTimestamp() })));
      if (targets.length > 0) await refetch(true);
      return targets.length;
    },
    [records, refetch]
  );

  return { records, loading, error, refetch, applyMemoDecision };
}
