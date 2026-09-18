import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { compareObjectiveNumbers, groupByPlo, objectiveDocId } from "../domain/objectiveGrouping";
import type { TrainingObjective } from "../domain/types";

const COLLECTION = "trainingObjectives";

/** Firestore batches are capped at 500 writes. */
const BATCH_CHUNK_SIZE = 500;

export type TrainingObjectiveSeed = Omit<TrainingObjective, "id">;

function mapObjective(id: string, data: Record<string, unknown>): TrainingObjective {
  return {
    id,
    number: (data.number as string) ?? id,
    plo: (data.plo as string) ?? "",
    ploOrder: (data.ploOrder as number) ?? 0,
    subArea: (data.subArea as string) ?? "",
    title: (data.title as string) ?? "",
    graded: (data.graded as boolean) ?? true,
    requirements: (data.requirements as string) ?? "",
    performanceMeasures: (data.performanceMeasures as TrainingObjective["performanceMeasures"]) ?? [],
    references: (data.references as string[]) ?? [],
    relatedLessons: (data.relatedLessons as string[]) ?? [],
    instructor: (data.instructor as string) ?? "",
    additionalInfo: (data.additionalInfo as string) ?? "",
    proficiencyByLevel: (data.proficiencyByLevel as TrainingObjective["proficiencyByLevel"]) ?? { BC: "", BCL: "", ICL: "", SCL: "" },
  };
}

export function useTrainingObjectives() {
  const [catalog, setCatalog] = useState<TrainingObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      setCatalog(snap.docs.map((d) => mapObjective(d.id, d.data())).sort((a, b) => compareObjectiveNumbers(a.number, b.number)));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the Training Objectives catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const sections = useMemo(() => groupByPlo(catalog), [catalog]);

  /**
   * One-time (repeatable/idempotent) admin import of the Training Objectives
   * catalog from the seed JSON. Uses `objectiveDocId(ploOrder, number)` as a
   * deterministic doc ID (objective numbers like "1.1" recur across PLO
   * sections, so `number` alone is not unique), so re-running after fixing a
   * transcription typo upserts rather than duplicating or colliding across
   * sections. Chunked to respect Firestore's 500-writes-per-batch limit.
   */
  const seedFromJson = useCallback(
    async (objectives: TrainingObjectiveSeed[]) => {
      for (let i = 0; i < objectives.length; i += BATCH_CHUNK_SIZE) {
        const chunk = objectives.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const objective of chunk) {
          batch.set(doc(db, COLLECTION, objectiveDocId(objective.ploOrder, objective.number)), objective);
        }
        await batch.commit();
      }
      await refetch();
    },
    [refetch]
  );

  return { catalog, sections, loading, error, refetch, seedFromJson };
}
