import type { Cadet } from "./types";

/** Which parts of the hub a signed-in person can see. */
export type TrainingObjectivesAccess = "none" | "poc" | "gmc" | "full";

export interface TabAccess {
  trainingObjectives: TrainingObjectivesAccess;
  accountability: boolean;
  /** Deviation Memos visible when true. */
  memoReview: boolean;
  /** Absence Memos ALSO visible when true -- only ever true alongside memoReview. */
  memoReviewAbsence: boolean;
  /** Always true for anyone signed in -- Memo Submission has no restriction. */
  memoSubmission: boolean;
}

const ALL_ACCESS: TabAccess = { trainingObjectives: "full", accountability: true, memoReview: true, memoReviewAbsence: true, memoSubmission: true };
const POC_ACCESS: TabAccess = { trainingObjectives: "poc", accountability: true, memoReview: true, memoReviewAbsence: false, memoSubmission: true };
const GMC_ACCESS: TabAccess = { trainingObjectives: "gmc", accountability: true, memoReview: true, memoReviewAbsence: false, memoSubmission: true };
const TO_FULL_ONLY: TabAccess = { trainingObjectives: "full", accountability: false, memoReview: false, memoReviewAbsence: false, memoSubmission: true };
const MEMO_DEVIATION_ONLY: TabAccess = { trainingObjectives: "none", accountability: false, memoReview: true, memoReviewAbsence: false, memoSubmission: true };
const CADET_ONLY: TabAccess = { trainingObjectives: "none", accountability: false, memoReview: false, memoReviewAbsence: false, memoSubmission: true };

/**
 * Fully explicit per-person access -- deliberately not derived from roster Group/Flight, since
 * several people below are themselves in TRG/CWL groups but get a restricted subset rather than
 * full access (confirmed directly with the user; group membership alone grants nothing).
 * Add/remove an email here and redeploy to change someone's access.
 */
const ACCESS_BY_EMAIL: Record<string, TabAccess> = {
  "jorge.cortes4@upr.edu": ALL_ACCESS,
  "francisco.saltiel@upr.edu": ALL_ACCESS, // Saltiel Lima, Francisco
  "jossie.mo@upr.edu": ALL_ACCESS, // Mo Velez, Jossie

  "john.santiago12@upr.edu": POC_ACCESS, // Santiago Ruiz, John
  "lorean.delgado@upr.edu": POC_ACCESS, // Delgado Ortiz, Lorean
  "hector.belen@upr.edu": POC_ACCESS, // Belen Caraballo, Hector
  "edgardo.puente.afrotc@upr.edu": POC_ACCESS, // Puente Bonilla, Edgardo

  "alexis.rodriguez53@upr.edu": GMC_ACCESS, // Rodriguez Rivera, Alexis
  "fabiola.merle@upr.edu": GMC_ACCESS, // Merle Cintron, Fabiola
  "julian.vivas@upr.edu": GMC_ACCESS, // Vivas Gandarillas, Julian
  "jakob.garcia@upr.edu": GMC_ACCESS, // Garcia Feliberty, Jakob
  "sebastian.montalvo3@upr.edu": GMC_ACCESS, // Montalvo Nieves, Sebastian

  "angel.huertas2@upr.edu": TO_FULL_ONLY, // Huertas Pabón, Angel
  "edgar.feliciano3@upr.edu": MEMO_DEVIATION_ONLY, // Feliciano Feliciano, Edgardo
};

/**
 * Resolves what a signed-in person can see. Cadre (roster `isCadre` flag) get full access
 * automatically even without being individually listed above; everyone else not listed gets
 * Memo Submission only.
 */
export function resolveTabAccess(email: string | null | undefined, roster: Cadet[]): TabAccess {
  if (!email) return CADET_ONLY;
  const normalized = email.trim().toLowerCase();
  const explicit = ACCESS_BY_EMAIL[normalized];
  if (explicit) return explicit;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.isCadre === true) return ALL_ACCESS;
  return CADET_ONLY;
}
