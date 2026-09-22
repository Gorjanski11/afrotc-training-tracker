import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import type { AbsenceMemoStatus, AbsenceReason } from "../domain/constants";
import type { AbsenceMemoRef, Cadet, PmtEvent } from "../domain/types";

const COLLECTION = "absenceMemos";

function mapRef(id: string, data: Record<string, unknown>): AbsenceMemoRef {
  return {
    id,
    cadetId: (data.cadetId as string) ?? "",
    pmtEventIds: (data.pmtEventIds as string[]) ?? [],
    attendanceIds: (data.attendanceIds as string[]) ?? [],
    status: ((data.status as AbsenceMemoStatus) ?? "Assigned") as AbsenceMemoStatus,
  };
}

/**
 * Owns the "an Absence Memo is assigned the instant a cadet is marked Absent" side effect. The
 * shared `absenceMemos` collection is otherwise owned by the Memo Review (cadre review) and Memo
 * Submission (cadet-facing) tabs -- this hook only ever creates the initial "Assigned" record (or
 * retracts one if a mistaken Absent entry gets corrected before the cadet ever acts on it) and
 * never touches anything past that point.
 */
export function useAbsenceMemoAssignments() {
  const [refs, setRefs] = useState<AbsenceMemoRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // `silent` skips the loading flip -- the hub swaps to a full-page skeleton while any hook is
  // loading, which would otherwise unmount the Accountability screen mid-Save the moment this
  // hook's own post-write refetch starts.
  const refetch = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setRefs(snap.docs.map((d) => mapRef(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load absence memo assignments.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /**
   * Creates the "Assigned" record for this cadet+PMT, unless one already exists and isn't
   * Rejected -- Rejected is final (project rule), so a fresh Absent mark after that starts a new
   * assignment; every other existing status (Assigned/Pending/Accepted/Returned) already covers it.
   */
  const assignAbsenceMemo = useCallback(
    async (cadet: Cadet, pmtEvent: PmtEvent, reason: AbsenceReason | undefined, attendanceId: string) => {
      const alreadyCovered = refs.some((m) => m.cadetId === cadet.id && m.pmtEventIds.includes(pmtEvent.id) && m.status !== "Rejected");
      if (alreadyCovered) return;

      await addDoc(collection(db, COLLECTION), {
        ...sanitizeForFirestore({
          cadetId: cadet.id,
          cadetName: cadet.name,
          pmtEventIds: [pmtEvent.id],
          attendanceIds: [attendanceId],
          reason: reason ?? "Other",
          medicalDocSent: false,
          status: "Assigned" as const,
          submittedAt: "",
          assignedAt: new Date().toISOString(),
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await refetch(true);
    },
    [refs, refetch]
  );

  /**
   * Retracts a not-yet-submitted "Assigned" record for this cadet+PMT -- used when a mistaken
   * Absent entry gets corrected to something else before the cadet ever acts on it. Only ever
   * targets a single-PMT machine-created assignment, never anything a cadet has folded into a
   * merged, submitted, or decided memo.
   */
  const retractAssignment = useCallback(
    async (cadetId: string, pmtEventId: string) => {
      const target = refs.find(
        (m) => m.cadetId === cadetId && m.status === "Assigned" && m.pmtEventIds.length === 1 && m.pmtEventIds[0] === pmtEventId
      );
      if (!target) return;
      await deleteDoc(doc(db, COLLECTION, target.id));
      await refetch(true);
    },
    [refs, refetch]
  );

  /**
   * A cadet can pre-submit an Absence Memo for a future PMT they already know they'll miss (Memo
   * Submission), before attendance has ever been recorded for it -- that memo sits at "Pending"
   * with a "" placeholder in `attendanceIds` at the slot matching that PMT. The instant Accountability
   * actually marks that cadet Absent for the real thing, this links the newly-created Attendance
   * doc id into that placeholder and reports back so the caller can save the attendance straight to
   * "PE" (excuse already pending) instead of "A".
   */
  const linkPreSubmittedAttendance = useCallback(
    async (cadetId: string, pmtEventId: string, attendanceId: string): Promise<boolean> => {
      const target = refs.find((m) => {
        if (m.cadetId !== cadetId || m.status !== "Pending") return false;
        const index = m.pmtEventIds.indexOf(pmtEventId);
        return index !== -1 && !m.attendanceIds[index];
      });
      if (!target) return false;

      const index = target.pmtEventIds.indexOf(pmtEventId);
      const nextAttendanceIds = [...target.attendanceIds];
      while (nextAttendanceIds.length < target.pmtEventIds.length) nextAttendanceIds.push("");
      nextAttendanceIds[index] = attendanceId;

      await updateDoc(doc(db, COLLECTION, target.id), { attendanceIds: nextAttendanceIds, updatedAt: serverTimestamp() });
      await refetch(true);
      return true;
    },
    [refs, refetch]
  );

  return { refs, loading, error, refetch, assignAbsenceMemo, retractAssignment, linkPreSubmittedAttendance };
}
