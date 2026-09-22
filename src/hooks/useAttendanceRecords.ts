import { useCallback, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

const COLLECTION = "attendance";

export interface AttendanceRecordRef {
  id: string;
  cadetId: string;
  pmtEventId: string;
  status: string;
}

function mapRecord(id: string, data: Record<string, unknown>): AttendanceRecordRef {
  return {
    id,
    cadetId: (data.cadetId as string) ?? "",
    pmtEventId: (data.pmtEventId as string) ?? "",
    status: (data.status as string) ?? "",
  };
}

/** Read-only -- the Accountability site owns this collection. Used only to flag "Absent but no Absence Memo filed yet" on the Dashboard; this site never writes here. */
export function useAttendanceRecords() {
  const [records, setRecords] = useState<AttendanceRecordRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setRecords(snap.docs.map((d) => mapRecord(d.id, d.data())));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { records, loading, error, refetch };
}
