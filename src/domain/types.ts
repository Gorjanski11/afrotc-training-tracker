import type { AsClass, CadetStatus, DevLevel, PmtEventType, ProficiencyCode } from "./constants";

export interface Cadet {
  id: string;
  name: string;
  asClass: AsClass | undefined;
  devLevel: DevLevel | undefined;
  status: CadetStatus | undefined;
  notes: string;
}

/**
 * Proficiency requirement for a dev level, as free text ("Ka"/"Kb"/"P1"/"P2"/"P3",
 * or occasionally a composite like "P1/P2" straight from the source document's
 * table). Empty string "" means "not required at this level" (the old app's
 * "N/A" sentinel) -- this is intentionally NOT a strict enum, unlike
 * ProficiencyCode (which constrains what a cadet can actually be *logged* at).
 */
export type ProficiencyText = string;

export interface PerformanceMeasure {
  text: string;
  optional: boolean;
}

export interface TrainingObjective {
  /** Firestore doc id -- same as `number` (e.g. "2.1"), deterministic for idempotent seeding. */
  id: string;
  /** e.g. "2.1" */
  number: string;
  /** Program Learning Outcome section, e.g. "Leader of Character". */
  plo: string;
  /** Sort order for the 5 PLO sections (1-5). */
  ploOrder: number;
  /** Numbered sub-area title within the PLO, e.g. "2. Effective Followership, Leadership, and Teamwork Skills". */
  subArea: string;
  title: string;
  /** false if the source document marked this "**" (non-graded) -- reference-only, excluded from all tracking. */
  graded: boolean;
  requirements: string;
  performanceMeasures: PerformanceMeasure[];
  references: string[];
  relatedLessons: string[];
  instructor: string;
  additionalInfo: string;
  proficiencyByLevel: Record<DevLevel, ProficiencyText>;
}

export interface Completion {
  id: string;
  cadetId: string;
  cadetName: string;
  objectiveId: string;
  objectiveNumber: string;
  proficiencyAchieved: ProficiencyCode;
  dateCompleted: string | undefined;
  evaluator: string;
  notes: string;
}

export interface PmtEvent {
  id: string;
  title: string;
  /** ISO datetime */
  eventDate: string;
  eventType: PmtEventType;
  location: string;
  /** Up to 3 POC-in-charge cadets for this session, plus the POC supervisor overseeing it. */
  pocic: string;
  pocic2: string;
  pocic3: string;
  pocsup: string;
  trainingWeek: number | undefined;
  /** Training Objective ids covered by this PMT event. */
  objectiveIds: string[];
  notes: string;
}

/** Presentational grouping (PLO -> sub-area -> objectives) built client-side from the flat trainingObjectives collection. */
export interface ProgramLearningOutcomeSection {
  plo: string;
  ploOrder: number;
  subAreas: { subArea: string; objectives: TrainingObjective[] }[];
}
