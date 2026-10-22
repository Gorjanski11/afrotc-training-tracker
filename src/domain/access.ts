import { deriveClass, type Flight, type Group } from "./constants";
import { formatCadetName } from "./nameUtils";
import type { AbsenceMemo, AccessOverride, Cadet, DeviationAssignOverrideInput, DeviationMemo, PermissionsConfig } from "./types";

/**
 * The real Cortes Garay (SAE) email, baked into code and never shown as editable -- a deliberate
 * break-glass safety net (Permissions tab plan, Section 1 "Root email safety net"): a typo or bad
 * save in the editable `PermissionsConfig.rootEmail` field can never fully lock the real owner out
 * of impersonation/data-delete/maintenance-bypass. `isCortesGaray` checks this OR the editable field.
 */
const BREAK_GLASS_ROOT_EMAIL = "jorge.cortes4@upr.edu";

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
 * Santiago, TRG -- a "pocGroupPlusGmc" accessOverride). TO's shows both cohorts. Accountability +
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
 * Turns a Permissions-tab `AccessOverride` (Cadet.accessOverride) into the `TabAccess` it represents
 * -- the editable replacement for the old hardcoded ACCESS_BY_EMAIL table. `group`/`flight` are only
 * meaningful for the tiers that need them; absent for the rest.
 */
function tierFromOverride(override: AccessOverride): TabAccess {
  switch (override.tier) {
    case "all":
      return ALL_ACCESS;
    case "toFullOnly":
      return TO_FULL_ONLY;
    case "deviationOnly":
      return MEMO_DEVIATION_ONLY;
    case "pocGroup":
      return pocGroupAccess(override.group ?? "OG");
    case "pocGroupPlusGmc":
      return pocGroupPlusAllGmcAccess(override.group ?? "OG");
    case "gmcFlight":
      return gmcFlightAccess(override.flight ?? "M");
    case "gmcWide":
      return GMC_WIDE_ACCESS;
  }
}

/**
 * Resolves what a signed-in person can see. A Permissions-tab `accessOverride` wins first; failing
 * that, Cadre (roster `isCadre` flag) get full access automatically; everyone else gets Memo
 * Submission only. `gmcDashboard`/`pocDashboard` (Section 13) are resolved as an independent extra
 * step on top of whichever tier above applies -- every GMC or POC cadet gets their own dashboard,
 * regardless of tier.
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
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.accessOverride) return tierFromOverride(match.accessOverride);
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

/** An Inactive cadet is no longer being tracked -- excluded everywhere in the app except the Settings Roster, where cadre manages/reactivates them. */
export function excludeInactive(roster: Cadet[]): Cadet[] {
  return roster.filter((p) => p.status !== "Inactive");
}

/**
 * Drops any cadetId-keyed row (attendance, an absence/deviation memo, a completion, ...) that
 * belongs to an Inactive cadet -- same blanket rule as `excludeInactive`, for data that's keyed by
 * cadet rather than being a roster array itself. Settings' Roster/Data Management/New Semester are
 * the only places still allowed to see an Inactive cadet's records.
 */
export function excludeInactiveRows<T extends { cadetId: string }>(rows: T[], roster: Cadet[]): T[] {
  const inactiveIds = new Set(roster.filter((p) => p.status === "Inactive").map((p) => p.id));
  return rows.filter((r) => !inactiveIds.has(r.cadetId));
}

/** The whole ALL_ACCESS tier (Cadre + Cortes Garay + Saltiel + Mo Velez) -- gates Settings' Account Manager and the Data Management screen. */
export function isFullAccess(email: string | null | undefined, roster: Cadet[]): boolean {
  return resolveBaseTabAccess(email, roster) === ALL_ACCESS;
}

/**
 * Cadre, Cortes Garay, or CWL -- gates Settings' Manage Passwords screen and the New Semester
 * feature. The Cloud Function independently re-checks this same rule server-side. Simplifies to
 * "root OR full access" now that CWL (Saltiel/Mo Velez) hold their access via the editable
 * `accessOverride: {tier:"all"}` -- `isFullAccess` already covers them, so no separate hardcoded
 * email list is needed here.
 */
export function isCadreOrCortesGaray(email: string | null | undefined, roster: Cadet[], config: PermissionsConfig): boolean {
  return isCortesGaray(email, config) || isFullAccess(email, roster);
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
export function canResetPasswordsFor(email: string | null | undefined, roster: Cadet[], config: PermissionsConfig, target: Cadet): boolean {
  if (isCadreOrCortesGaray(email, roster, config)) return true;
  const access = resolveBaseTabAccess(email, roster);
  if (access.unitScope.kind === "all") return false; // full-access-but-not-reset tier (none exist today, but keep the distinction)
  return applyUnitScope(access.unitScope, roster).some((p) => p.id === target.id);
}

/**
 * Cortes Garay alone -- narrower even than `isCadreOrCortesGaray`. Gates Data Management's PDF
 * delete and the whole New Semester screen (it can wipe/recreate the entire roster, calendar, and
 * cadet logins), plus impersonation and the maintenance-mode bypass. The
 * createCadetAccounts/disableCadetAccounts Cloud Functions independently re-check this same rule
 * server-side (against the hardcoded break-glass email only -- they don't read Firestore config).
 * Checks the editable `config.rootEmail` OR the hardcoded break-glass email (see
 * `BREAK_GLASS_ROOT_EMAIL` above) -- either one is accepted, so a bad edit in the Permissions tab
 * can never fully lock the real owner out.
 */
export function isCortesGaray(email: string | null | undefined, config: PermissionsConfig): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized === BREAK_GLASS_ROOT_EMAIL || normalized === config.rootEmail.trim().toLowerCase();
}

/** The Operations Flight Commander (Permissions tab's editable `config.ofcEmail`) -- gates the "Needs OFC notes" queue in Deviation Memos (Section: DNS/OFC linking). */
export function isOfc(email: string | null | undefined, config: PermissionsConfig): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized || !config.ofcEmail) return false;
  return normalized === config.ofcEmail.trim().toLowerCase();
}

/** Cortes Garay or Cadre (roster `isCadre` flag) only -- deliberately narrower than `isCadreOrCortesGaray` (excludes CWL). Gates the permanent Absence Memo delete action in Memo Review. */
export function canDeleteAbsenceMemo(email: string | null | undefined, roster: Cadet[], config: PermissionsConfig): boolean {
  if (isCortesGaray(email, config)) return true;
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match?.isCadre === true;
}

// ---------------------------------------------------------------------------
// Event add/edit -- restricted to 4 named staff positions + Cadre (Section A5)
// ---------------------------------------------------------------------------

/** OG Commander, DO, ETO, SAE by default -- editable via the Permissions tab's "Event Edit Authority" section (`config.eventEditOverrideEmails`). Everyone else with Settings access sees Events read-only. */
export function canEditEvents(email: string | null | undefined, roster: Cadet[], config: PermissionsConfig): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (config.eventEditOverrideEmails.some((e) => e.trim().toLowerCase() === normalized)) return true;
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match?.isCadre === true;
}

// ---------------------------------------------------------------------------
// AS-class instructor visibility (Section G) -- Capt Jackson (AS100), Lt Laboy (AS200), TSgt
// Reynoso (AS300), and Capt Deaton (AS400) are all true Cadre already (roster isCadre flag),
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

/** CWL/Cadre fallback -- assign to anyone, but (per the user) only reviews what they personally assigned, not everyone's. */
const RULE_EVERYONE_OWN_REVIEW: DeviationAssignRule = { canAssign: true, assignScope: "everyone", reviewOwnOnly: true };
const RULE_CANNOT_ASSIGN: DeviationAssignRule = { canAssign: false, assignScope: "any-gmc", reviewOwnOnly: true };

/**
 * Turns a Permissions-tab `DeviationAssignOverrideInput` (Cadet.deviationAssignOverride) into the
 * internal `DeviationAssignRule` -- the editable replacement for the old hardcoded
 * DEVIATION_ASSIGN_OVERRIDES table. `alsoVisibleEmails` (e.g. Montalvo seeing every GMC Flight
 * Commander's memos) is now part of the override data itself rather than derived from a separate
 * table, so it survives independently of who currently holds which Flight Commander email.
 */
function deviationRuleFromOverride(override: DeviationAssignOverrideInput): DeviationAssignRule {
  const assignScope: DeviationAssignScope =
    override.scope === "flight"
      ? { flight: override.flight ?? "M" }
      : override.scope === "group"
        ? { group: override.group ?? "OG" }
        : override.scope === "cannot-assign"
          ? "everyone" // irrelevant once canAssign is false below
          : override.scope;
  return {
    canAssign: override.scope !== "cannot-assign",
    assignScope,
    reviewOwnOnly: override.reviewOwnOnly,
    alsoVisibleAssignerEmails: override.alsoVisibleEmails,
  };
}

/**
 * Who can assign a Deviation Memo, to whom, and whether they only ever review their own. A
 * Permissions-tab `deviationAssignOverride` wins first; failing that, Cadre (roster `isCadre`) get
 * everyone/own-review automatically; everyone else cannot assign at all.
 */
export function resolveDeviationAssignRule(email: string | null | undefined, roster: Cadet[]): DeviationAssignRule {
  if (!email) return RULE_CANNOT_ASSIGN;
  const normalized = email.trim().toLowerCase();
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.deviationAssignOverride) return deviationRuleFromOverride(match.deviationAssignOverride);
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
 * True Cadre only see an Absence Memo if they're the general reviewer (`config.generalAbsenceReviewerEmail`,
 * sees everything) or it's an AS-Class memo for the specific class they instruct
 * (`config.asClassInstructorEmail`). Cortes Garay/CWL are unrestricted, same as today -- only true
 * Cadre narrows. Memo Submission/everyone-else never had memoReviewAbsence access to begin with, so
 * this is only ever consulted for the full-access tier.
 */
export function canSeeAbsenceMemo(email: string | null | undefined, roster: Cadet[], memo: AbsenceMemo, config: PermissionsConfig): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (match?.isCadre !== true) return true; // Cortes Garay/CWL -- unrestricted
  if (normalized === config.generalAbsenceReviewerEmail.trim().toLowerCase()) return true;
  return !!memo.asClass && config.asClassInstructorEmail[memo.asClass]?.trim().toLowerCase() === normalized;
}
/** Every Absence Memo `email` is allowed to see, per `canSeeAbsenceMemo`. */
export function visibleAbsenceMemos(email: string | null | undefined, roster: Cadet[], memos: AbsenceMemo[], config: PermissionsConfig): AbsenceMemo[] {
  return memos.filter((m) => canSeeAbsenceMemo(email, roster, m, config));
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
  const active = excludeInactive(roster); // an Inactive cadet is never an assignable deviation-memo target
  if (scope === "everyone") return excludeCadre(active); // a Deviation Memo target is always a cadet, never Cadre (Section 4)
  if (scope === "everyone-except-cadre") return active.filter((p) => !p.isCadre);
  if (scope === "any-gmc") return active.filter((p) => deriveClass(p.asClass, p.isCadre) === "GMC");
  if ("flight" in scope) return active.filter((p) => p.flight === scope.flight);
  return active.filter((p) => p.group === scope.group);
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
  return excludeInactive(roster).filter((p) => p.email && resolveDeviationAssignRule(p.email, roster).canAssign);
}

/** POC-class or Cadre -- who's eligible to be CC'd on a Deviation Memo. */
export function getCcEligiblePeople(roster: Cadet[]): Cadet[] {
  return excludeInactive(roster).filter((p) => p.isCadre || deriveClass(p.asClass, p.isCadre) === "POC");
}

/**
 * The signed-in person's own display name -- Absence Memo review now attributes `reviewedBy` to
 * whoever is actually logged in (any Cadre or the SAE, all of whom are authorized to review) instead
 * of a single hardcoded reviewer name. Falls back to the raw email if no roster match is found.
 */
export function currentPersonName(email: string | null | undefined, roster: Cadet[]): string {
  if (!email) return "";
  const normalized = email.trim().toLowerCase();
  const match = roster.find((p) => p.email?.trim().toLowerCase() === normalized);
  return match ? formatCadetName(match) : email;
}
