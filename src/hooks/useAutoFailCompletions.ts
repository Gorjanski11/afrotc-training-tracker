import { useCallback } from "react";
import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { sanitizeForFirestore } from "../lib/firestoreUtils";
import { PROFICIENCY_CODES, PROFICIENCY_RANK, type ProficiencyCode } from "../domain/constants";
import type { Cadet, PmtEvent, TrainingObjective } from "../domain/types";

const COLLECTION = "completions";
const AUTO_EVALUATOR = "System (Auto: Absent)";

/** Required-proficiency cells are usually a single code ("P2"), occasionally a composite ("P1/P2") -- mirrors Quick Log's own helper. */
function firstRequiredCode(cell: string): ProficiencyCode | undefined {
  const first = cell.split("/")[0]?.trim();
  return (PROFICIENCY_CODES as readonly string[]).includes(first) ? (first as ProficiencyCode) : undefined;
}

/** The nearest code below the required one -- "almost made it" rather than always bottoming out at Ka. Mirrors Quick Log's own helper. */
function defaultNotPassCode(required: ProficiencyCode): ProficiencyCode {
  const options = PROFICIENCY_CODES.filter((p) => p !== required);
  const below = options.filter((p) => PROFICIENCY_RANK[p] < PROFICIENCY_RANK[required]);
  if (below.length === 0) return options[0];
  return below.reduce((best, p) => (PROFICIENCY_RANK[p] > PROFICIENCY_RANK[best] ? p : best));
}

/**
 * Absence auto-fail (explicit project rule): marking a cadet Absent on a PMT automatically logs a
 * Not Pass against every Training Objective tied to that PMT -- graded or optional alike -- in the
 * shared `completions` collection. An absence always overwrites whatever grade (if any) was already
 * logged for that cadet/objective/occurrence. Once set this way, nothing here ever auto-reverts it
 * -- not a later excuse (AE/PE), not a status correction away from "A" -- a human has to re-grade it
 * manually from Quick Log or Cadet Detail, same as any other completion.
 */
export function useAutoFailCompletions() {
  const applyAbsenceNotPass = useCallback(async (cadet: Cadet, pmtEvent: PmtEvent, catalogById: Map<string, TrainingObjective>) => {
    if (!cadet.devLevel || pmtEvent.objectiveIds.length === 0) return;

    const existingSnap = await getDocs(query(collection(db, COLLECTION), where("cadetId", "==", cadet.id)));
    const existingByObjective = new Map<string, string>(); // `${objectiveId}:${pmtEventId ?? ""}` -> docId
    for (const d of existingSnap.docs) {
      const data = d.data();
      const key = `${data.objectiveId}:${(data.pmtEventId as string | null | undefined) ?? ""}`;
      existingByObjective.set(key, d.id);
    }

    for (const objectiveId of pmtEvent.objectiveIds) {
      const objective = catalogById.get(objectiveId);
      if (!objective) continue;
      const requiredCell = objective.proficiencyByLevel[cadet.devLevel];
      if (!requiredCell) continue; // not applicable at this cadet's level
      const requiredCode = firstRequiredCode(requiredCell) ?? "P1";
      const notPassCode = defaultNotPassCode(requiredCode);

      const input = {
        cadetId: cadet.id,
        cadetName: cadet.name,
        objectiveId,
        objectiveNumber: objective.number,
        proficiencyAchieved: notPassCode,
        dateCompleted: new Date().toISOString().slice(0, 10),
        evaluator: AUTO_EVALUATOR,
        notes: `Auto-logged: marked Absent for "${pmtEvent.title}".`,
        pmtEventId: pmtEvent.id,
        partial: false,
      };

      const key = `${objectiveId}:${pmtEvent.id}`;
      const existingId = existingByObjective.get(key);
      if (existingId) {
        await updateDoc(doc(db, COLLECTION, existingId), { ...sanitizeForFirestore(input), updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, COLLECTION), { ...sanitizeForFirestore(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
    }
  }, []);

  return { applyAbsenceNotPass };
}
