import type { Group, Flight } from "./constants";

/**
 * Cross-tab "take me there" intent -- set by a dashboard tile/row click (Cadre Dashboard, My
 * Dashboard's SAE section), consumed once by the destination tab (AnalyticsApp/MemoReviewApp) to
 * select the right sub-screen and pre-filter it, then cleared. Mirrors the existing
 * targetPmtEventId/initialPmtEventId pattern AccountabilityApp already uses for its own
 * Dashboard -> Attendance jump.
 */
export type DashboardNavIntent =
  | { kind: "memoReview"; screen: "absence" | "deviation"; openMemoId?: string }
  | { kind: "accountabilityAnalytics"; cadetId?: string; group?: Group; flight?: Flight }
  | { kind: "settings"; section: "saeReview" };
