import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * A narrow write into the Accountability site's shared `attendance` collection (same Firebase
 * project) -- flips the given records to "PE" (Pending Excuse) the moment a cadet submits an
 * Absence Memo covering them. The ids come straight off the Absence Memo doc(s) the cadet is
 * folding into this submission, so no query is needed here.
 */
export async function flipAttendanceToPendingExcuse(attendanceIds: string[]): Promise<void> {
  await Promise.all(attendanceIds.map((id) => updateDoc(doc(db, "attendance", id), { status: "PE", updatedAt: serverTimestamp() })));
}
