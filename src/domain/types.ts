import type {
  AbsenceAsClass,
  AbsenceMemoStatus,
  AbsenceReason,
  AsClass,
  AttendanceStatus,
  CadetStatus,
  DeviationMemoStatus,
  DevLevel,
  ExtraEventType,
  Flight,
  Group,
  Instructor,
  PmtEventType,
  ProficiencyCode,
} from "./constants";

export interface Cadet {
  id: string;
  name: string;
  asClass: AsClass | undefined;
  devLevel: DevLevel | undefined;
  status: CadetStatus | undefined;
  notes: string;
  /** Shared across POC ("TO's" ICL/SCL) and GMC (BC/BCL) -- one roster for both cohorts. */
  email: string | undefined;
  /** GMC only -- POC cadets never have a Flight. */
  flight: Flight | undefined;
  /** Same field the Accountability site owns on this shared roster -- always set for POC, GMC only if they hold a staff position within a group. */
  group: Group | undefined;
  /** Manual override -- when true this person is Cadre regardless of AS Level/devLevel. Also used by the hub's access rule (domain/access.ts). */
  isCadre: boolean;
  /** Free text -- role within `group`, or one of the 5 Cadre-only positions. */
  position: string | undefined;
  /** Manual-entry date (ISO) -- needed for "recently deactivated" flagging since Active/Inactive alone can't show recency. */
  statusChangedDate: string | undefined;
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
  /**
   * Which PMT occurrence this was graded at. For objectives covered by only one PMT this is
   * mostly informational; for objectives covered by several (material split across sessions),
   * it's what lets each occurrence carry its own independent Pass/Not Pass/Partial in Quick Log --
   * every occurrence must be individually satisfied for the objective to read as completed (see
   * getObjectiveStatus), since a qualifying completion at one occurrence doesn't cover another.
   */
  pmtEventId: string | undefined;
  /**
   * Set when this was logged via Quick Log's "Partial" flow, regardless of which proficiency code
   * was entered -- it records that the evaluator is only vouching for the material actually covered
   * at this one occurrence, not a definitive session pass. A Partial entry never satisfies that
   * occurrence's requirement (see getObjectiveStatus/meetsRequirement), no matter how high the code
   * entered is -- only a plain Pass (partial: false) at or above the required proficiency counts.
   */
  partial: boolean;
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

// ---------------------------------------------------------------------------
// Ported from afrotc-accountability-tracker/src/domain/types.ts and
// afrotc-memorandums-tracker/src/domain/types.ts as part of consolidating all
// 4 sites into this one hub -- shapes are unchanged from their source repo.
// ---------------------------------------------------------------------------

/** Accountability (Section 4.1) -- one record per cadet per PMT. */
export interface Attendance {
  id: string;
  cadetId: string;
  pmtEventId: string;
  status: AttendanceStatus;
  /** Required when status is "A". */
  absenceReason: AbsenceReason | undefined;
  /** ISO datetime the entry was actually recorded, so "outside the normal window" can be flagged. */
  recordedAt: string;
  notes: string;
}

/** Accountability's own collection -- events that never affect accountability (Section 3.2). */
export interface ExtraEvent {
  id: string;
  title: string;
  eventDate: string;
  eventType: ExtraEventType;
  location: string;
  pocic: string;
  notes: string;
  /** Set only when eventType is "Reposition" -- the original PMT this event stands in for. */
  repositionsPmtEventId: string | undefined;
}

/** Extra Event attendance (Section 4.3) -- a simple attendee list, never a percentage input. */
export interface ExtraEventAttendance {
  id: string;
  extraEventId: string;
  attendeeCadetIds: string[];
}

/**
 * A cadet's writeup covering one or more missed PMTs, with an uploaded PDF (Firebase Storage) as
 * the actual memorandum document. Accountability auto-creates the initial "Assigned" record the
 * instant a cadet is marked Absent; the cadet then submits (Memo Submission tab) which flips the
 * covered Attendance record(s) A -> PE. On Accepted/Rejected, Memo Review writes a side-effect
 * update into `attendance`: each covered PMT's Attendance record flips PE -> AE (Accepted) or
 * PE -> A (Rejected, final). Returned has no Attendance side-effect (stays PE) -- sent back to the
 * cadet to fix and resubmit.
 */
export interface AbsenceMemo {
  id: string;
  cadetId: string;
  cadetName: string;
  /** Every PMT this single memo covers -- empty when this memo is only for an AS-Class absence below. */
  pmtEventIds: string[];
  /** Attendance doc ids parallel to `pmtEventIds` -- "" placeholder for a PMT pre-submitted before it happened, until Accountability links the real id in. */
  attendanceIds: string[];
  /** ISO datetime Accountability auto-created this as "Assigned" -- undefined for a memo the cadet created fresh. */
  assignedAt: string | undefined;
  /** AS-Class-absence fields -- a memo can cover a missed PMT, a missed AS-Class session, or both. All four are set together or not at all. */
  asClass: AbsenceAsClass | undefined;
  classDate: string | undefined;
  classTitle: string | undefined;
  instructor: Instructor | undefined;
  reason: AbsenceReason;
  /** Whether medical documentation was sent to the detachment separately from this memo. */
  medicalDocSent: boolean;
  pdfUrl: string | undefined;
  pdfFileName: string | undefined;
  status: AbsenceMemoStatus;
  submittedAt: string;
  reviewedAt: string | undefined;
  /** Free text -- no auth-based identity binding, reviewer is hardcoded per screen instead. */
  reviewedBy: string | undefined;
  reviewNotes: string;
  /** Required when status is "Returned" -- what the cadet needs to fix before resubmitting. */
  returnReason: string | undefined;
  /** Set once the Accepted/Rejected Attendance side-effect has actually been written, so it's never silently reapplied. */
  attendanceUpdatedAt: string | undefined;
  /**
   * Set when this memo was auto-rejected for being late -- kept even if cadre later overrides the
   * status, so history/analytics can still show why. `"late"` = submitted within the 72h+24h grace
   * window but after the 72h deadline. `"dns"` (Did Not Submit) = never submitted at all, even
   * through the grace window (the `escalateOverdueAbsenceMemos` escalation path).
   */
  lateSubmission: "late" | "dns" | undefined;
}

/** One person referenced by email+display name -- used for the deviation memo assigner/CC fields (Section 7 of the plan), where identity needs to be matched reliably rather than just displayed. */
export interface PersonRef {
  email: string;
  name: string;
}

/** Assigned by a reviewer for a standards deviation, submitted by the cadet (with a PDF), then resolved as Accepted or Returned -- never Rejected outright. */
export interface DeviationMemo {
  id: string;
  cadetId: string;
  cadetName: string;
  /** Display name of whoever assigned it -- populated from the `PersonCombobox` selection, not free-typed. */
  assignedBy: string;
  /** Email of whoever assigned it -- used for assign/review access scoping (domain/access.ts). Undefined on memos created before Section 7 shipped. */
  assignedByEmail: string | undefined;
  /** People CC'd on this memo -- can view it but, per policy, cannot review it (only the assigner can). */
  cc: PersonRef[];
  /** What the deviation was (e.g. uniform, grooming, punctuality) -- free text, no fixed catalog. */
  reason: string;
  dateAssigned: string;
  dueDate: string | undefined;
  status: DeviationMemoStatus;
  pdfUrl: string | undefined;
  pdfFileName: string | undefined;
  submittedAt: string | undefined;
  reviewedAt: string | undefined;
  reviewedBy: string | undefined;
  reviewNotes: string;
}

/** Minimal mirror of the shared `absenceMemos` collection -- just enough for Accountability's auto-assignment hook to know whether a cadet+PMT absence already has an in-flight memo covering it. */
export interface AbsenceMemoRef {
  id: string;
  cadetId: string;
  pmtEventIds: string[];
  /** Parallel to `pmtEventIds` -- "" placeholder until the real Attendance doc id is linked in. */
  attendanceIds: string[];
  status: AbsenceMemoStatus;
}
