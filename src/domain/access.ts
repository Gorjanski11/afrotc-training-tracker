import { deriveClass, type Flight, type Group } from "./constants";
import type { Cadet } from "./types";

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
  };
}

/**
 * A POC Group Commander who's ALSO been given unrestricted GMC TO access (e.g. Santiago, TRG --
 * see ACCESS_BY_EMAIL). TO's shows both cohorts (home picker); Accountability + TO's are scoped to
 * their own group for POC, but see every GMC cadet unrestricted (not just their own group's GMC
 * staff). Since Accountability shares the same `unitScope`, this also widens their Accountability
 * roster to include all GMC -- accepted as correct here since the only person using this helper is
 * already a Group Commander whose GMC TO access implies GMC accountability responsibility too.
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
  "edgar.feliciano3@upr.edu": MEMO_DEVIATION_ONLY, // Feliciano Feliciano, Edgardo
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
  return { ...base, gmcDashboard: cohort === "GMC", pocDashboard: cohort === "POC" };
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
}

const RULE_EVERYONE: DeviationAssignRule = { canAssign: true, assignScope: "everyone", reviewOwnOnly: false };
/** CWL -- assign to anyone like Cortes Garay/Cadre, but (per the user) only reviews what they personally assigned, not everyone's. */
const RULE_EVERYONE_OWN_REVIEW: DeviationAssignRule = { canAssign: true, assignScope: "everyone", reviewOwnOnly: true };
const RULE_ANY_GMC: DeviationAssignRule = { canAssign: true, assignScope: "any-gmc", reviewOwnOnly: true };
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
  "edgar.feliciano3@upr.edu": RULE_ANY_GMC,
};

/**
 * Who can assign a Deviation Memo, to whom, and whether they only ever review their own. Explicit
 * per-email overrides first, then Cadre (roster `isCadre`) get everyone/full-review automatically;
 * everyone else cannot assign at all.
 */
export function resolveDeviationAssignRule(email: string | null | undefined, roster: Cadet[]): DeviationAssignRule {
  if (!email) return RULE_CANNOT_ASSIGN;
  const normalized = email.trim().toLowerCase();
  const override = DEVIATION_ASSIGN_OVERRIDES[normalized];
  if (override) return override;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.isCadre === true) return RULE_EVERYONE;
  return RULE_CANNOT_ASSIGN;
}

/** Cadets a given assign scope allows targeting -- drives the cadet picker in the Assign tab. */
export function cadetsInAssignScope(scope: DeviationAssignScope, roster: Cadet[]): Cadet[] {
  if (scope === "everyone") return excludeCadre(roster); // a Deviation Memo target is always a cadet, never Cadre (Section 4)
  if (scope === "everyone-except-cadre") return roster.filter((p) => !p.isCadre);
  if (scope === "any-gmc") return roster.filter((p) => deriveClass(p.asClass, p.isCadre) === "GMC");
  if ("flight" in scope) return roster.filter((p) => p.flight === scope.flight);
  return roster.filter((p) => p.group === scope.group);
}

/** Every roster member currently authorized to assign a Deviation Memo -- populates the "Assigned by" combobox. */
export function getAuthorizedDeviationAssigners(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.email && resolveDeviationAssignRule(p.email, roster).canAssign);
}

/** POC-class or Cadre -- who's eligible to be CC'd on a Deviation Memo. */
export function getCcEligiblePeople(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.isCadre || deriveClass(p.asClass, p.isCadre) === "POC");
}
