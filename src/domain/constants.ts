// This app tracks POC cadets only (ICL/SCL) -- GMC levels (BC/BCL) are present in
// the source AFROTCI 36-2011 Vol 1 document's proficiency tables but are
// intentionally never ingested/displayed, per the SAE's request.
export const DEV_LEVELS = ["ICL", "SCL"] as const;
export type DevLevel = (typeof DEV_LEVELS)[number];

export const DEV_LEVEL_LABELS: Record<DevLevel, string> = {
  ICL: "Intermediate Cadet Leader (ICL)",
  SCL: "Senior Cadet Leader (SCL)",
};

export const AS_CLASSES = ["AS300", "AS400"] as const;
export type AsClass = (typeof AS_CLASSES)[number];

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

// PMT (Practical Military Training) session types tracked on the Calendar tab.
export const PMT_EVENT_TYPES = ["LLAB", "FM", "D&C"] as const;
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
