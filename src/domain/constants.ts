// BC/BCL = General Military Course (GMC) levels; ICL/SCL = Professional Officer
// Course (POC) levels. Both cohorts share the same catalog/PMT calendar/roster --
// the "POC TO's" and "GMC TO's" screens just filter by which of these applies.
export const DEV_LEVELS = ["BC", "BCL", "ICL", "SCL"] as const;
export type DevLevel = (typeof DEV_LEVELS)[number];

export const GMC_DEV_LEVELS = ["BC", "BCL"] as const satisfies readonly DevLevel[];
export const POC_DEV_LEVELS = ["ICL", "SCL"] as const satisfies readonly DevLevel[];

export const DEV_LEVEL_LABELS: Record<DevLevel, string> = {
  BC: "Basic Cadet (BC)",
  BCL: "Basic Cadet Leader (BCL)",
  ICL: "Intermediate Cadet Leader (ICL)",
  SCL: "Senior Cadet Leader (SCL)",
};

export const AS_CLASSES = ["AS100", "AS200", "AS250", "AS300", "AS400", "AS500", "AS600"] as const;
export type AsClass = (typeof AS_CLASSES)[number];
/** Alias for the name Accountability's/Memorandums' ported code uses for this same field. */
export type AsLevel = AsClass;

export const FLIGHTS = ["M", "N", "O", "P"] as const;
export type Flight = (typeof FLIGHTS)[number];

// Mirrors the Accountability site's GROUPS -- same shared `cadets` collection, same field.
export const GROUPS = ["CWL", "TRG", "OG", "MSG", "WSG"] as const;
export type Group = (typeof GROUPS)[number];

export const CADET_STATUSES = ["Active", "Inactive", "Commissioned"] as const;
export type CadetStatus = (typeof CADET_STATUSES)[number];

export const PROFICIENCY_CODES = ["Ka", "Kb", "P1", "P2", "P3"] as const;
export type ProficiencyCode = (typeof PROFICIENCY_CODES)[number];

// Ordinal rank used to decide whether a logged completion satisfies a required
// proficiency level (e.g. a cadet logged at P2 satisfies a P1 requirement).
export const PROFICIENCY_RANK: Record<ProficiencyCode, number> = {
  Ka: 1,
  Kb: 2,
  P1: 3,
  P2: 4,
  P3: 5,
};

// PMT (Practical Military Training) session types tracked on the Calendar tab. This calendar is
// shared with the separate Accountability site (same pmtEvents collection, same Firebase project)
// -- "PT" exists for pure physical-training sessions that Accountability tracks attendance for.
export const PMT_EVENT_TYPES = ["LLAB", "FM", "D&C", "PT"] as const;
export type PmtEventType = (typeof PMT_EVENT_TYPES)[number];

// The 5 Program Learning Outcome sections from AFROTCI 36-2011 Vol 1, in document order.
export const PLO_SECTIONS = [
  "Leader of Character",
  "Disciplined Professional",
  "Effective Communicator",
  "Warfighter",
  "Strategic-Minded Officer",
] as const;
export type PloSection = (typeof PLO_SECTIONS)[number];

// ---------------------------------------------------------------------------
// Ported from afrotc-accountability-tracker/src/domain/constants.ts and
// afrotc-memorandums-tracker/src/domain/constants.ts as part of consolidating
// all 4 sites into this one hub -- values are unchanged from their source repo.
// ---------------------------------------------------------------------------

export const ROSTER_CLASSES = ["Cadre", "POC", "GMC"] as const;
export type RosterClass = (typeof ROSTER_CLASSES)[number];

const GMC_AS_LEVELS: readonly AsClass[] = ["AS100", "AS200", "AS250", "AS500"];

/** Cadre is always a manual override (isCadre flag), checked first by the caller. */
export function deriveClass(asLevel: AsClass | undefined, isCadre: boolean): RosterClass {
  if (isCadre) return "Cadre";
  if (asLevel && GMC_AS_LEVELS.includes(asLevel)) return "GMC";
  return "POC";
}

export const EXTRA_EVENT_TYPES = ["Extra PT", "Extra D&C", "Reposition", "Bonding"] as const;
export type ExtraEventType = (typeof EXTRA_EVENT_TYPES)[number];

/** Accountability status per cadet per PMT. */
export const ATTENDANCE_STATUSES = ["P", "L", "A", "AE", "PE"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  P: "Present",
  L: "Late",
  A: "Absent",
  AE: "Approved Excuse",
  PE: "Pending Excuse",
};

/**
 * Weight per status for percentage math. An Approved Excuse (AE) counts exactly like a Present --
 * the absence is still recorded and shown as "Approved Excuse" everywhere in the UI, but it never
 * costs the cadet toward standing/percent once accepted. PE (still pending review) stays
 * `undefined` -- excluded entirely from both the numerator and denominator until it's resolved one
 * way or the other, so an in-review excuse doesn't yet count for or against the cadet.
 */
export const ATTENDANCE_WEIGHT: Record<AttendanceStatus, number | undefined> = {
  P: 1,
  L: 0.5,
  A: 0,
  AE: 1,
  PE: undefined,
};

export const ABSENCE_REASONS = ["Academics", "Medical", "Personal", "Work/Job", "Other"] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

/** Percentage bucket for threshold purposes: PT stands alone, LLAB+FM+D&C are combined (D&C is a type of LLAB session). "OTHER" is unused today -- kept for any future PMT type that shouldn't count toward either threshold. */
export type AttendanceBucket = "PT" | "LLAB_FM" | "OTHER";

export function bucketForEventType(eventType: PmtEventType): AttendanceBucket {
  if (eventType === "PT") return "PT";
  if (eventType === "LLAB" || eventType === "FM" || eventType === "D&C") return "LLAB_FM";
  return "OTHER";
}

export type Standing = "Good" | "Warning" | "Hard Limit";

export const STANDING_THRESHOLDS = { good: 0.85, warning: 0.8 } as const;

export function standingForPercent(percent: number | undefined): Standing | undefined {
  if (percent === undefined) return undefined;
  if (percent >= STANDING_THRESHOLDS.good) return "Good";
  if (percent >= STANDING_THRESHOLDS.warning) return "Warning";
  return "Hard Limit";
}

/** Fixed semester totals for the attendance % denominator (Section 1 of the plan) -- update these each semester. D&C occurrences count toward LLAB_FM since D&C is a type of LLAB session. */
export const SEMESTER_PMT_TOTALS: Record<"PT" | "LLAB_FM", number> = { PT: 27, LLAB_FM: 28 };

// AS Class options for an academic-class absence (as opposed to a PMT absence) -- deliberately a
// narrower list than the full roster AS_CLASSES above (no AS250/AS500/AS600 -- those don't have
// their own AS-class instruction block).
export const ABSENCE_AS_CLASSES = ["AS100", "AS200", "AS300", "AS400"] as const;
export type AbsenceAsClass = (typeof ABSENCE_AS_CLASSES)[number];

export const INSTRUCTORS = ["Lt Col Laboy", "Capt Jackson", "Capt Deaton", "TSgt Reynoso"] as const;
export type Instructor = (typeof INSTRUCTORS)[number];

/**
 * Absence Memo lifecycle. "Assigned" -- auto-created the instant a cadet is marked Absent, before
 * the cadet has done anything. "Pending" -- the cadet has submitted, which also flips the covered
 * Attendance record(s) from A to PE. Accepted -> flips PE to AE. Rejected -> flips PE back to A;
 * also the automatic outcome of a late submission or a missed deadline (see `lateSubmission` on
 * AbsenceMemo). Returned -> sent back to the cadet to fix and resubmit within 48 hours, no
 * Attendance side-effect (stays PE). No status here is truly final -- cadre can manually override
 * any memo to any status at any time (Section 2b of the plan).
 */
export const ABSENCE_MEMO_STATUSES = ["Assigned", "Pending", "Accepted", "Rejected", "Returned"] as const;
export type AbsenceMemoStatus = (typeof ABSENCE_MEMO_STATUSES)[number];

// PMT type -> local clock time the session ends, used for the 72-hour Absence Memo submission deadline.
export const PMT_END_TIME: Record<PmtEventType, { hours: number; minutes: number }> = {
  PT: { hours: 6, minutes: 30 },
  LLAB: { hours: 11, minutes: 45 },
  FM: { hours: 11, minutes: 45 },
  "D&C": { hours: 11, minutes: 45 },
};

/** A cadet has 72 hours from the PMT's own end time (not the time it was marked Absent) to submit an Absence Memo covering it. */
export function absenceMemoDeadline(eventDate: string, eventType: PmtEventType): Date {
  const end = new Date(eventDate);
  const { hours, minutes } = PMT_END_TIME[eventType];
  end.setHours(hours, minutes, 0, 0);
  return new Date(end.getTime() + 72 * 3_600_000);
}

/**
 * Deviation Memo lifecycle -- assign, cadet submits, reviewer accepts or returns. "Late" is set
 * automatically once `dueDate` passes with no submission (still submittable). "Not Submitted" is
 * set automatically 24h after that with still no submission -- terminal, hidden from the cadet's
 * own submit screen, but still visible in review/history/analytics. No status here is final --
 * cadre can manually override any memo to any status at any time (Section 2b of the plan).
 */
export const DEVIATION_MEMO_STATUSES = ["Assigned", "Submitted", "Late", "Accepted", "Returned", "Not Submitted"] as const;
export type DeviationMemoStatus = (typeof DEVIATION_MEMO_STATUSES)[number];

export const MEMO_STATUS_LABELS: Record<string, string> = {
  Pending: "Pending",
  Accepted: "Accepted",
  Rejected: "Rejected",
  Returned: "Returned",
  Assigned: "Assigned",
  Submitted: "Submitted",
  Late: "Late",
  "Not Submitted": "Not Submitted",
};
