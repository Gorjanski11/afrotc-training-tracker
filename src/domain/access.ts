import { deriveClass, type Flight, type Group } from "./constants";
import type { Cadet } from "./types";

/** Which parts of the hub a signed-in person can see. */
export type TrainingObjectivesAccess = "none" | "poc" | "gmc" | "full";

/**
 * How much of the roster a person's Accountability and Training Objectives views are narrowed to
 * (Section 5) -- applied everywhere in both sub-apps (Dashboard, Roster, Events, Attendance /
 * Dashboard, Cadet Detail, Roster, Calendar, Quick Log), not just the Dashboard.
 */
export type UnitScope = { kind: "all" } | { kind: "group"; group: Group } | { kind: "flight"; flight: Flight } | { kind: "gmc" };

const SCOPE_ALL: UnitScope = { kind: "all" };

export interface TabAccess {
  trainingObjectives: TrainingObjectivesAccess;
  accountability: boolean;
  /** Deviation Memos visible when true. */
  memoReview: boolean;
  /** Absence Memos ALSO visible when true -- only ever true alongside memoReview. */
  memoReviewAbsence: boolean;
  /** Always true for anyone signed in -- Memo Submission has no restriction. */
  memoSubmission: boolean;
  unitScope: UnitScope;
}

const ALL_ACCESS: TabAccess = {
  trainingObjectives: "full",
  accountability: true,
  memoReview: true,
  memoReviewAbsence: true,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
};
const TO_FULL_ONLY: TabAccess = {
  trainingObjectives: "full",
  accountability: false,
  memoReview: false,
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
};
const MEMO_DEVIATION_ONLY: TabAccess = {
  trainingObjectives: "none",
  accountability: false,
  memoReview: true,
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
};
const CADET_ONLY: TabAccess = {
  trainingObjectives: "none",
  accountability: false,
  memoReview: true, // unused (memoReview flag is false below) -- kept only for shape consistency
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
};
CADET_ONLY.memoReview = false;

/** A POC Group Commander -- TO's POC-only, Accountability + TO's scoped to their own group. */
function pocGroupAccess(group: Group): TabAccess {
  return { trainingObjectives: "poc", accountability: true, memoReview: true, memoReviewAbsence: false, memoSubmission: true, unitScope: { kind: "group", group } };
}

/** A GMC Flight Commander -- TO's GMC-only, Accountability + TO's scoped to their own flight. */
function gmcFlightAccess(flight: Flight): TabAccess {
  return { trainingObjectives: "gmc", accountability: true, memoReview: true, memoReviewAbsence: false, memoSubmission: true, unitScope: { kind: "flight", flight } };
}

/** Montalvo Nieves -- GMC-wide (all 4 flights), not scoped to a single flight. */
const GMC_WIDE_ACCESS: TabAccess = {
  trainingObjectives: "gmc",
  accountability: true,
  memoReview: true,
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: { kind: "gmc" },
};

/**
 * Fully explicit per-person access -- deliberately not derived from roster Group/Flight, since
 * several people below are themselves in TRG/CWL groups but get a restricted subset rather than
 * full access (confirmed directly with the user; group membership alone grants nothing).
 * Add/remove an email here and redeploy to change someone's access.
 */
const ACCESS_BY_EMAIL: Record<string, TabAccess> = {
  "jorge.cortes4@upr.edu": ALL_ACCESS,
  "francisco.saltiel@upr.edu": ALL_ACCESS, // Saltiel Lima, Francisco (CWL)
  "jossie.mo@upr.edu": ALL_ACCESS, // Mo Velez, Jossie (CWL)

  "john.santiago12@upr.edu": pocGroupAccess("TRG"), // Santiago Ruiz, John (TRG Group Commander)
  "lorean.delgado@upr.edu": pocGroupAccess("OG"), // Delgado Ortiz, Lorean (OG Group Commander)
  "hector.belen@upr.edu": pocGroupAccess("MSG"), // Belen Caraballo, Hector (MSG Group Commander)
  "edgardo.puente.afrotc@upr.edu": pocGroupAccess("WSG"), // Puente Bonilla, Edgardo (WSG Group Commander)

  "alexis.rodriguez53@upr.edu": gmcFlightAccess("P"), // Rodriguez Rivera, Alexis (P Flight Commander)
  "fabiola.merle@upr.edu": gmcFlightAccess("M"), // Merle Cintron, Fabiola (M Flight Commander)
  "julian.vivas@upr.edu": gmcFlightAccess("N"), // Vivas Gandarillas, Julian (N Flight Commander)
  "jakob.garcia@upr.edu": gmcFlightAccess("O"), // Garcia Feliberty, Jakob (O Flight Commander)
  "sebastian.montalvo3@upr.edu": GMC_WIDE_ACCESS, // Montalvo Nieves, Sebastian (CTO -- all GMC, TRG group)

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

/** Narrows a roster to whatever a `UnitScope` allows -- used by AccountabilityApp/TrainingObjectivesApp (Section 5). */
export function applyUnitScope(scope: UnitScope, roster: Cadet[]): Cadet[] {
  if (scope.kind === "all") return roster;
  if (scope.kind === "group") return roster.filter((p) => p.group === scope.group);
  if (scope.kind === "flight") return roster.filter((p) => p.flight === scope.flight);
  return roster.filter((p) => deriveClass(p.asClass, p.isCadre) === "GMC");
}

// ---------------------------------------------------------------------------
// Section 7 -- Deviation Memo assign/review permission matrix
// ---------------------------------------------------------------------------

export type DeviationAssignScope = "everyone" | "everyone-except-cadre" | "any-gmc" | { flight: Flight };

export interface DeviationAssignRule {
  canAssign: boolean;
  assignScope: DeviationAssignScope;
  /** True unless this person reviews everyone's (Cadre/Cortes Garay) -- when true, they only ever see memos they assigned or were CC'd on. */
  reviewOwnOnly: boolean;
}

const RULE_EVERYONE: DeviationAssignRule = { canAssign: true, assignScope: "everyone", reviewOwnOnly: false };
const RULE_EVERYONE_EXCEPT_CADRE: DeviationAssignRule = { canAssign: true, assignScope: "everyone-except-cadre", reviewOwnOnly: true };
const RULE_ANY_GMC: DeviationAssignRule = { canAssign: true, assignScope: "any-gmc", reviewOwnOnly: true };
const RULE_CANNOT_ASSIGN: DeviationAssignRule = { canAssign: false, assignScope: "any-gmc", reviewOwnOnly: true };

function flightRule(flight: Flight): DeviationAssignRule {
  return { canAssign: true, assignScope: { flight }, reviewOwnOnly: true };
}

/**
 * Per-email overrides, checked before the roster-driven fallback below -- several people share a
 * roster attribute (e.g. Montalvo and Santiago are both TRG-group) but need different assign
 * scopes, the same precedence convention `resolveTabAccess` already uses for ALL_ACCESS/isCadre.
 */
const DEVIATION_ASSIGN_OVERRIDES: Record<string, DeviationAssignRule> = {
  "jorge.cortes4@upr.edu": RULE_EVERYONE,
  "sebastian.montalvo3@upr.edu": RULE_ANY_GMC, // Montalvo -- TRG-group by roster, but scoped to GMC only
  "alexis.rodriguez53@upr.edu": flightRule("P"),
  "fabiola.merle@upr.edu": flightRule("M"),
  "julian.vivas@upr.edu": flightRule("N"),
  "jakob.garcia@upr.edu": flightRule("O"),
  "edgar.feliciano3@upr.edu": RULE_ANY_GMC,
};

/**
 * Who can assign a Deviation Memo, to whom, and whether they only ever review their own. Explicit
 * per-email overrides first, then a roster-driven fallback (Cadre -> everyone/full-review; anyone
 * else in the TRG group -> everyone-except-cadre/own-review-only, covering Santiago as the TRG
 * Group Commander plus any other TRG-group cadet); everyone else cannot assign at all.
 */
export function resolveDeviationAssignRule(email: string | null | undefined, roster: Cadet[]): DeviationAssignRule {
  if (!email) return RULE_CANNOT_ASSIGN;
  const normalized = email.trim().toLowerCase();
  const override = DEVIATION_ASSIGN_OVERRIDES[normalized];
  if (override) return override;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.isCadre === true) return RULE_EVERYONE;
  if (match?.group === "TRG") return RULE_EVERYONE_EXCEPT_CADRE;
  return RULE_CANNOT_ASSIGN;
}

/** Cadets a given assign scope allows targeting -- drives the cadet picker in the Assign tab. */
export function cadetsInAssignScope(scope: DeviationAssignScope, roster: Cadet[]): Cadet[] {
  if (scope === "everyone") return roster;
  if (scope === "everyone-except-cadre") return roster.filter((p) => !p.isCadre);
  if (scope === "any-gmc") return roster.filter((p) => deriveClass(p.asClass, p.isCadre) === "GMC");
  return roster.filter((p) => p.flight === scope.flight);
}

/** Every roster member currently authorized to assign a Deviation Memo -- populates the "Assigned by" combobox. */
export function getAuthorizedDeviationAssigners(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.email && resolveDeviationAssignRule(p.email, roster).canAssign);
}

/** POC-class or Cadre -- who's eligible to be CC'd on a Deviation Memo. */
export function getCcEligiblePeople(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.isCadre || deriveClass(p.asClass, p.isCadre) === "POC");
}
