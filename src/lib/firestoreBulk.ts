import { collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase";

/** Firestore batches are capped at 500 writes -- chunk to stay under it. */
const CHUNK_SIZE = 400;

/** Deletes every document in a collection. Used by New Semester's full wipe of attendance/memo/completion/calendar data -- the signed-in caller already satisfies every collection's write rule (either open write, or "any signed-in user"). */
export async function deleteAllInCollection(collectionName: string): Promise<number> {
  const snap = await getDocs(collection(db, collectionName));
  let batch = writeBatch(db);
  let count = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    count++;
    if (count % CHUNK_SIZE === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  if (count % CHUNK_SIZE !== 0) await batch.commit();
  return count;
}
