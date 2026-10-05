import { deriveClass, type AbsenceAsClass, type Flight, type Group } from "./constants";
import type { AbsenceMemo, Cadet, DeviationMemo } from "./types";

/** Which parts of the hub a signed-in person can see. */
export type TrainingObjectivesAccess = "none" | "poc" | "gmc" | "full";

/**
 * How much of the roster a person's Accountability and Training Objectives views are narrowed to
 * (Section 5) -- applied everywhere in both sub-apps (Dashboard, Roster, Events, Attendance /
 * Dashboard, Cadet Detail, Roster, Calendar, Quick Log), not just the Dashboard.
 */
export type UnitScope =
  | { kind: "all" }
  | { kind: "group"; group: Group }
  | { kind: "flight"; flight: Flight }
  | { kind: "gmc" }
  | { kind: "group-and-gmc"; group: Group };

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
  /**
   * True for every GMC-class cadet (Section 13) -- computed independently of whichever tier above
   * this person resolved to, so a plain GMC cadet (otherwise CADET_ONLY) still gets it, and a GMC
   * Flight Commander gets it on top of their existing access.
   */
  gmcDashboard: boolean;
  /** Same as `gmcDashboard`, but for every POC-class cadet -- the two are mutually exclusive. */
  pocDashboard: boolean;
  /**
   * True for true Cadre (roster `isCadre` flag -- the detachment's actual officer/NCO staff, not
   * Cortes Garay or CWL, who are POC-cohort cadets with ALL_ACCESS instead). Mutually exclusive with
   * gmcDashboard/pocDashboard. Also the signal App.tsx uses to hide the Accountability, TO's, and
   * Memo Submission tabs -- true Cadre oversee/review, they don't personally take attendance, grade
   * TOs, or submit their own memos the way cadets do.
   */
  cadreDashboard: boolean;
}

const ALL_ACCESS: TabAccess = {
  trainingObjectives: "full",
  accountability: true,
  memoReview: true,
  memoReviewAbsence: true,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
  gmcDashboard: false,
  pocDashboard: false,
  cadreDashboard: false,
};
const TO_FULL_ONLY: TabAccess = {
  trainingObjectives: "full",
  accountability: false,
  memoReview: false,
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
  gmcDashboard: false,
  pocDashboard: false,
  cadreDashboard: false,
};
const MEMO_DEVIATION_ONLY: TabAccess = {
  trainingObjectives: "none",
  accountability: false,
  memoReview: true,
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
  gmcDashboard: false,
  pocDashboard: false,
  cadreDashboard: false,
};
const CADET_ONLY: TabAccess = {
  trainingObjectives: "none",
  accountability: false,
  memoReview: true, // unused (memoReview flag is false below) -- kept only for shape consistency
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: SCOPE_ALL,
  gmcDashboard: false,
  pocDashboard: false,
  cadreDashboard: false,
};
CADET_ONLY.memoReview = false;

/** A POC Group Commander -- TO's POC-only, Accountability + TO's scoped to their own group. */
function pocGroupAccess(group: Group): TabAccess {
  return {
    trainingObjectives: "poc",
    accountability: true,
    memoReview: true,
    memoReviewAbsence: false,
    memoSubmission: true,
    unitScope: { kind: "group", group },
    gmcDashboard: false,
    pocDashboard: false,
    cadreDashboard: false,
  };
}

/**
 * A POC Group Commander who's ALSO been given unrestricted GMC access across the board (e.g.
 * Santiago, TRG -- see ACCESS_BY_EMAIL). TO's shows both cohorts (home picker). Accountability +
 * TO's + Accountability Analytics are all scoped to their own group for POC, but see every GMC
 * cadet unrestricted regardless of flight -- confirmed with the user this covers GMC accountability
 * submission and analytics too, not just TO's, since all three read the same `unitScope`.
 */
function pocGroupPlusAllGmcAccess(group: Group): TabAccess {
  return {
    trainingObjectives: "full",
    accountability: true,
    memoReview: true,
    memoReviewAbsence: false,
    memoSubmission: true,
    unitScope: { kind: "group-and-gmc", group },
    gmcDashboard: false,
    pocDashboard: false,
    cadreDashboard: false,
  };
}

/** A GMC Flight Commander -- TO's GMC-only, Accountability + TO's scoped to their own flight. */
function gmcFlightAccess(flight: Flight): TabAccess {
  return {
    trainingObjectives: "gmc",
    accountability: true,
    memoReview: true,
    memoReviewAbsence: false,
    memoSubmission: true,
    unitScope: { kind: "flight", flight },
    gmcDashboard: false,
    pocDashboard: false,
    cadreDashboard: false,
  };
}

/** Montalvo Nieves -- GMC-wide (all 4 flights), not scoped to a single flight. */
const GMC_WIDE_ACCESS: TabAccess = {
  trainingObjectives: "gmc",
  accountability: true,
  memoReview: true,
  memoReviewAbsence: false,
  memoSubmission: true,
  unitScope: { kind: "gmc" },
  gmcDashboard: false,
  pocDashboard: false,
  cadreDashboard: false,
};

/**
 * Reverse lookup of ACCESS_BY_EMAIL's unit-scoped commanders -- who to hold responsible when a
 * Group's/Flight's Accountability or TO reporting is late or missing (SAE Review, Section: SOP
 * Sections 3/4 responsibility attribution). Kept as its own explicit table rather than derived from
 * ACCESS_BY_EMAIL at runtime, matching this file's existing "explicit per-person" convention.
 */
export const GROUP_COMMANDER_EMAIL: Record<Group, string> = {
  OG: "lorean.delgado@upr.edu",
  MSG: "hector.belen@upr.edu",
  WSG: "edgardo.puente.afrotc@upr.edu",
  TRG: "john.santiago12@upr.edu",
  // CWL isn't an accountability-reporting unit in practice (no dedicated cadet body of its own) --
  // mapped to Saltiel only so this stays a total function; never expected to actually fire.
  CWL: "francisco.saltiel@upr.edu",
};
export const FLIGHT_COMMANDER_EMAIL: Record<Flight, string> = {
  P: "alexis.rodriguez53@upr.edu",
  M: "fabiola.merle@upr.edu",
  N: "julian.vivas@upr.edu",
  O: "jakob.garcia@upr.edu",
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
  "michael.deaton@upr.edu": ALL_ACCESS, // Capt Deaton (Cadre, OFC)
  "jason.laboy@upr.edu": ALL_ACCESS, // Lt Col Laboy (Cadre)
  "jalen.jackson@upr.edu": ALL_ACCESS, // Capt Jackson (Cadre)
  "adolfo.reynoso@upr.edu": ALL_ACCESS, // TSgt Reynoso (Cadre)
  "trinity.dance@upr.edu": ALL_ACCESS, // Dance, Trinity (Cadre)

  "john.santiago12@upr.edu": pocGroupPlusAllGmcAccess("TRG"), // Santiago Ruiz, John (TRG Group Commander) -- also given unrestricted GMC TO access
  "lorean.delgado@upr.edu": pocGroupAccess("OG"), // Delgado Ortiz, Lorean (OG Group Commander)
  "hector.belen@upr.edu": pocGroupAccess("MSG"), // Belen Caraballo, Hector (MSG Group Commander)
  "edgardo.puente.afrotc@upr.edu": pocGroupAccess("WSG"), // Puente Bonilla, Edgardo (WSG Group Commander)

  "alexis.rodriguez53@upr.edu": gmcFlightAccess("P"), // Rodriguez Rivera, Alexis (P Flight Commander)
  "fabiola.merle@upr.edu": gmcFlightAccess("M"), // Merle Cintron, Fabiola (M Flight Commander)
  "julian.vivas@upr.edu": gmcFlightAccess("N"), // Vivas Gandarillas, Julian (N Flight Commander)
  "jakob.garcia@upr.edu": gmcFlightAccess("O"), // Garcia Feliberty, Jakob (O Flight Commander)
  "sebastian.montalvo3@upr.edu": GMC_WIDE_ACCESS, // Montalvo Nieves, Sebastian (CTO -- all GMC, TRG group)

  "angel.huertas2@upr.edu": TO_FULL_ONLY, // Huertas Pabón, Angel
  "edgar.feliciano3@upr.edu": MEMO_DEVIATION_ONLY, // Feliciano Feliciano, Edgar (PFO)
};

/**
 * Resolves what a signed-in person can see. Cadre (roster `isCadre` flag) get full access
 * automatically even without being individually listed above; everyone else not listed gets
 * Memo Submission only. `gmcDashboard`/`pocDashboard` (Section 13) are resolved as an independent
 * extra step on top of whichever tier above applies -- every GMC or POC cadet gets their own
 * dashboard, regardless of tier.
 */
export function resolveTabAccess(email: string | null | undefined, roster: Cadet[]): TabAccess {
  const base = resolveBaseTabAccess(email, roster);
  if (!email) return base;
  const normalized = email.trim().toLowerCase();
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  const cohort = match ? deriveClass(match.asClass, match.isCadre) : undefined;
  return { ...base, gmcDashboard: cohort === "GMC", pocDashboard: cohort === "POC", cadreDashboard: cohort === "Cadre" };
}

function resolveBaseTabAccess(email: string | null | undefined, roster: Cadet[]): TabAccess {
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
  if (scope.kind === "group-and-gmc") return roster.filter((p) => p.group === scope.group || deriveClass(p.asClass, p.isCadre) === "GMC");
  return roster.filter((p) => deriveClass(p.asClass, p.isCadre) === "GMC");
}

/** Cadre supervise everyone but are never a trackable subject themselves (Section 4) -- excluded from every roster-scoped view except the Settings Roster (the deliberate "account database" exception). */
export function excludeCadre(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => !p.isCadre);
}

/** An Inactive cadet is no longer being tracked -- excluded from Accountability and TO's the same way Cadre is, everywhere except the Settings Roster where cadre manages/reactivates them. */
export function excludeInactive(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.status !== "Inactive");
}

/** The whole ALL_ACCESS tier (Cadre + Cortes Garay + Saltiel + Mo Velez) -- gates Settings' Account Manager and the Data Management screen. */
export function isFullAccess(email: string | null | undefined, roster: Cadet[]): boolean {
  return resolveBaseTabAccess(email, roster) === ALL_ACCESS;
}

/** Cadre, Cortes Garay, or CWL (Saltiel/Mo Velez) -- gates Settings' Manage Passwords screen and the New Semester feature. The Cloud Function independently re-checks this same rule server-side. */
export function isCadreOrCortesGaray(email: string | null | undefined, roster: Cadet[]): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized === "jorge.cortes4@upr.edu" || normalized === "francisco.saltiel@upr.edu" || normalized === "jossie.mo@upr.edu") return true;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match?.isCadre === true;
}

/**
 * Anyone allowed into Settings' Account Manager: the full-access tier (Cadre/Cortes Garay/CWL, who
 * see and can reset everyone), plus every unit-scoped commander (POC Group Commander, GMC Flight
 * Commander) who can view and reset only their own unit's cadets. Unlike `isCadreOrCortesGaray`,
 * this does not imply reset rights by itself -- pair with `canResetPasswordsFor` below.
 */
export function canManageAccounts(email: string | null | undefined, roster: Cadet[]): boolean {
  if (isFullAccess(email, roster)) return true;
  const access = resolveBaseTabAccess(email, roster);
  return access.unitScope.kind !== "all";
}

/** Everyone `canManageAccounts` covers can also reset passwords -- scoped to their own unit via `TabAccess.unitScope`, full roster for the full-access tier. Cloud Function re-checks server-side (isCadreOrCortesGaray or roster-scoped equivalent). */
export function canResetPasswordsFor(email: string | null | undefined, roster: Cadet[], target: Cadet): boolean {
  if (isCadreOrCortesGaray(email, roster)) return true;
  const access = resolveBaseTabAccess(email, roster);
  if (access.unitScope.kind === "all") return false; // full-access-but-not-reset tier (none exist today, but keep the distinction)
  return applyUnitScope(access.unitScope, roster).some((p) => p.id === target.id);
}

/** Cortes Garay alone -- narrower even than `isCadreOrCortesGaray`. Gates Data Management's PDF delete and the whole New Semester screen (it can wipe/recreate the entire roster, calendar, and cadet logins). The createCadetAccounts/disableCadetAccounts Cloud Functions independently re-check this same rule server-side. */
export function isCortesGaray(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === "jorge.cortes4@upr.edu";
}

/** Cortes Garay or Cadre (roster `isCadre` flag) only -- deliberately narrower than `isCadreOrCortesGaray` (excludes CWL). Gates the permanent Absence Memo delete action in Memo Review. */
export function canDeleteAbsenceMemo(email: string | null | undefined, roster: Cadet[]): boolean {
  if (isCortesGaray(email)) return true;
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match?.isCadre === true;
}

// ---------------------------------------------------------------------------
// Event add/edit -- restricted to 4 named staff positions + Cadre (Section A5)
// ---------------------------------------------------------------------------

/** OG Commander (Delgado), DO (Ferrer), ETO (Huertas), SAE (Cortes Garay) -- everyone else with Settings access sees Events read-only. */
const EVENT_EDIT_OVERRIDE_EMAILS = new Set([
  "lorean.delgado@upr.edu", // Delgado Ortiz, Lorean (OG Commander)
  "sebastian.ferrer@upr.edu", // Ferrer Aponte, Sebastian (DO)
  "angel.huertas2@upr.edu", // Huertas Pabón, Angel (ETO)
  "jorge.cortes4@upr.edu", // Cortes Garay (SAE)
]);

/** Can add/edit/delete PMT and Extra Events. Everyone else with Settings access still views the calendar read-only. */
export function canEditEvents(email: string | null | undefined, roster: Cadet[]): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (EVENT_EDIT_OVERRIDE_EMAILS.has(normalized)) return true;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match?.isCadre === true;
}

// ---------------------------------------------------------------------------
// AS-class instructor visibility (Section G) -- Capt Jackson (AS100), Lt Laboy (AS200), TSgt
// Reynoso (AS300), and Capt Deaton (AS400) are all named Cadre already (ACCESS_BY_EMAIL above),
// and every Cadre-flagged person -- named or not, via the resolveBaseTabAccess roster fallback --
// already resolves to ALL_ACCESS, which includes memoReviewAbsence. So every AS-class instructor
// already sees every absence memo, including memos for AS classes they don't personally teach --
// no extra per-instructor scoping is needed here. Accept/reject is a UI/process convention (only
// Cortes Garay actually decides) rather than a code-enforced restriction, matching how the rest of
// this app already treats Cadre as a single trusted tier.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Section 7 -- Deviation Memo assign/review permission matrix
// ---------------------------------------------------------------------------

export type DeviationAssignScope = "everyone" | "everyone-except-cadre" | "any-gmc" | { flight: Flight } | { group: Group };

export interface DeviationAssignRule {
  canAssign: boolean;
  assignScope: DeviationAssignScope;
  /** True unless this person reviews everyone's (Cadre/Cortes Garay) -- when true, they only ever see memos they assigned or were CC'd on. */
  reviewOwnOnly: boolean;
  /** Extra emails whose assigned memos this viewer can also SEE (not review/decide, just read) even under reviewOwnOnly -- e.g. Montalvo seeing every GMC Flight Commander's deviation memos. */
  alsoVisibleAssignerEmails?: string[];
}

const RULE_EVERYONE: DeviationAssignRule = { canAssign: true, assignScope: "everyone", reviewOwnOnly: false };
/** CWL -- assign to anyone like Cortes Garay/Cadre, but (per the user) only reviews what they personally assigned, not everyone's. */
const RULE_EVERYONE_OWN_REVIEW: DeviationAssignRule = { canAssign: true, assignScope: "everyone", reviewOwnOnly: true };
/** Montalvo (CTO) -- assigns GMC-wide like any Flight Commander, but can also SEE (view only, never review/decide) every deviation memo any of the 4 GMC Flight Commanders assigned, not just his own. */
const RULE_ANY_GMC: DeviationAssignRule = {
  canAssign: true,
  assignScope: "any-gmc",
  reviewOwnOnly: true,
  alsoVisibleAssignerEmails: Object.values(FLIGHT_COMMANDER_EMAIL),
};
const RULE_CANNOT_ASSIGN: DeviationAssignRule = { canAssign: false, assignScope: "any-gmc", reviewOwnOnly: true };

function flightRule(flight: Flight): DeviationAssignRule {
  return { canAssign: true, assignScope: { flight }, reviewOwnOnly: true };
}

/** A POC Group Commander -- can assign to POC (and any GMC holding a staff position) in their own group only, and reviews only what they assigned. */
function groupRule(group: Group): DeviationAssignRule {
  return { canAssign: true, assignScope: { group }, reviewOwnOnly: true };
}

/**
 * Per-email overrides, checked before the roster-driven Cadre fallback below -- the only rule left
 * to a fallback is Cadre (canAssign to everyone, full review); every named commander below is an
 * explicit entry, matching the "only Group Commanders, Cortes Garay, CWL, and Cadre can target POC"
 * rule -- Flight Commanders stay GMC-only within their own flight.
 */
const DEVIATION_ASSIGN_OVERRIDES: Record<string, DeviationAssignRule> = {
  "jorge.cortes4@upr.edu": RULE_EVERYONE,
  "francisco.saltiel@upr.edu": RULE_EVERYONE_OWN_REVIEW, // Saltiel Lima, Francisco (CWL)
  "jossie.mo@upr.edu": RULE_EVERYONE_OWN_REVIEW, // Mo Velez, Jossie (CWL)

  "john.santiago12@upr.edu": groupRule("TRG"), // Santiago Ruiz, John (TRG Group Commander)
  "lorean.delgado@upr.edu": groupRule("OG"), // Delgado Ortiz, Lorean (OG Group Commander)
  "hector.belen@upr.edu": groupRule("MSG"), // Belen Caraballo, Hector (MSG Group Commander)
  "edgardo.puente.afrotc@upr.edu": groupRule("WSG"), // Puente Bonilla, Edgardo (WSG Group Commander)

  "sebastian.montalvo3@upr.edu": RULE_ANY_GMC, // Montalvo -- TRG-group by roster, but scoped to GMC only (CTO, not a Group Commander)
  "alexis.rodriguez53@upr.edu": flightRule("P"),
  "fabiola.merle@upr.edu": flightRule("M"),
  "julian.vivas@upr.edu": flightRule("N"),
  "jakob.garcia@upr.edu": flightRule("O"),
  // Feliciano Feliciano, Edgar -- PFO (Physical Fitness Officer), one of the 5 roles the SOP (1 Oct
  // 2026, Section 5) names with full deviation-memo assignment authority, same tier as CWL.
  "edgar.feliciano3@upr.edu": RULE_EVERYONE_OWN_REVIEW,
};

/**
 * Who can assign a Deviation Memo, to whom, and whether they only ever review their own. Explicit
 * per-email overrides first, then Cadre (roster `isCadre`) get everyone/own-review automatically
 * (true Cadre only ever see memos concerning them -- assigned by them or CC'd, same as CWL/unit
 * commanders; only Cortes Garay keeps unrestricted full review); everyone else cannot assign at all.
 */
export function resolveDeviationAssignRule(email: string | null | undefined, roster: Cadet[]): DeviationAssignRule {
  if (!email) return RULE_CANNOT_ASSIGN;
  const normalized = email.trim().toLowerCase();
  const override = DEVIATION_ASSIGN_OVERRIDES[normalized];
  if (override) return override;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.isCadre === true) return RULE_EVERYONE_OWN_REVIEW;
  return RULE_CANNOT_ASSIGN;
}

/** Every Deviation Memo concerning this viewer -- assigned by them, or they were CC'd -- or every memo at all if their rule isn't own-review-restricted. Shared by the review list, Memorandums Analytics, and the Cadre Dashboard's pending count, so all three agree on who sees what. */
export function visibleDeviationMemos(email: string | null | undefined, roster: Cadet[], memos: DeviationMemo[]): DeviationMemo[] {
  const rule = resolveDeviationAssignRule(email, roster);
  if (!rule.reviewOwnOnly) return memos;
  const normalized = (email ?? "").trim().toLowerCase();
  const alsoVisible = new Set((rule.alsoVisibleAssignerEmails ?? []).map((e) => e.trim().toLowerCase()));
  return memos.filter((m) => {
    const assignedByEmail = m.assignedByEmail?.trim().toLowerCase();
    return (
      assignedByEmail === normalized ||
      m.cc.some((c) => c.email.trim().toLowerCase() === normalized) ||
      (!!assignedByEmail && alsoVisible.has(assignedByEmail))
    );
  });
}
/** True when `email` sees this Deviation Memo only because they were CC'd on it, not because they assigned it -- used to show a "CC'd" badge explaining why it's in their list. */
export function isDeviationMemoViaCc(email: string | null | undefined, memo: DeviationMemo): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (memo.assignedByEmail?.trim().toLowerCase() === normalized) return false;
  return memo.cc.some((c) => c.email.trim().toLowerCase() === normalized);
}

/**
 * Which AS-Class each instructor reviews absence memos for (SOP Section G) -- reverse of
 * domain/constants.ts's INSTRUCTOR_BY_AS_CLASS (that one maps AS-Class -> display name for
 * auto-filling the Instructor field; this one maps AS-Class -> email for access scoping).
 */
const AS_CLASS_INSTRUCTOR_EMAIL: Record<AbsenceAsClass, string> = {
  AS100: "jalen.jackson@upr.edu", // Capt Jackson
  AS200: "jason.laboy@upr.edu", // Lt Col Laboy
  AS300: "adolfo.reynoso@upr.edu", // TSgt Reynoso
  AS400: "michael.deaton@upr.edu", // Capt Deaton
};
/** Capt Deaton is the detachment's general Absence Memo reviewer -- sees every memo, not just AS400's. */
const GENERAL_ABSENCE_REVIEWER_EMAIL = "michael.deaton@upr.edu";

/**
 * True Cadre only see an Absence Memo if they're Capt Deaton (the general reviewer, sees
 * everything) or it's an AS-Class memo for the specific class they instruct. Cortes Garay/CWL are
 * unrestricted, same as today -- only true Cadre narrows. Memo Submission/everyone-else never had
 * memoReviewAbsence access to begin with, so this is only ever consulted for the full-access tier.
 */
export function canSeeAbsenceMemo(email: string | null | undefined, roster: Cadet[], memo: AbsenceMemo): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.isCadre !== true) return true; // Cortes Garay/CWL -- unrestricted
  if (normalized === GENERAL_ABSENCE_REVIEWER_EMAIL) return true;
  return !!memo.asClass && AS_CLASS_INSTRUCTOR_EMAIL[memo.asClass] === normalized;
}
/** Every Absence Memo `email` is allowed to see, per `canSeeAbsenceMemo`. */
export function visibleAbsenceMemos(email: string | null | undefined, roster: Cadet[], memos: AbsenceMemo[]): AbsenceMemo[] {
  return memos.filter((m) => canSeeAbsenceMemo(email, roster, m));
}

/** True roster Cadre (the detachment's officer/NCO staff) -- distinct from Cortes Garay/CWL, who are POC-cohort with ALL_ACCESS. Drives Memorandums Analytics' "show all" toggle, since only true Cadre default to a scoped-to-them view. */
export function isTrueCadre(email: string | null | undefined, roster: Cadet[]): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match?.isCadre === true;
}

/** Cadets a given assign scope allows targeting -- drives the cadet picker in the Assign tab. */
export function cadetsInAssignScope(scope: DeviationAssignScope, roster: Cadet[]): Cadet[] {
  if (scope === "everyone") return excludeCadre(roster); // a Deviation Memo target is always a cadet, never Cadre (Section 4)
  if (scope === "everyone-except-cadre") return roster.filter((p) => !p.isCadre);
  if (scope === "any-gmc") return roster.filter((p) => deriveClass(p.asClass, p.isCadre) === "GMC");
  if ("flight" in scope) return roster.filter((p) => p.flight === scope.flight);
  return roster.filter((p) => p.group === scope.group);
}

/**
 * Deviation Memos may only be assigned Monday-Friday, 0400-2000 -- device-local time, same as every
 * other "now" check in this app (no timezone library is used anywhere else either). `canAssign` on
 * `DeviationAssignRule` governs WHO can assign; this governs WHEN, independent of who they are.
 */
export function isWithinDeviationAssignWindow(now: Date = new Date()): boolean {
  const day = now.getDay(); // 0 = Sunday ... 6 = Saturday
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour >= 4 && hour < 20;
}

/** Every roster member currently authorized to assign a Deviation Memo -- populates the "Assigned by" combobox. */
export function getAuthorizedDeviationAssigners(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.email && resolveDeviationAssignRule(p.email, roster).canAssign);
}

/** POC-class or Cadre -- who's eligible to be CC'd on a Deviation Memo. */
export function getCcEligiblePeople(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.isCadre || deriveClass(p.asClass, p.isCadre) === "POC");
}
