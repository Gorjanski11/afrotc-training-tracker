import { DEVIATION_REASONS } from "./constants";
import type { Cadet, DeviationMemo } from "./types";

/** The 4 merged top-level reasons (Uniform Discrepancy folded into Grooming & Appearance, Misconduct into Customs & Courtesies) -- Deviation's Log's 4 boxes/bar groups are exactly these. */
export type DeviationCategory = (typeof DEVIATION_REASONS)[number];

/** Defensive fallback for any stray reason text that isn't one of the 4 current options (shouldn't happen post-migration) -- falls into "Other" rather than silently vanishing from every count. */
export function categoryOf(memo: DeviationMemo): DeviationCategory {
  return (DEVIATION_REASONS as readonly string[]).includes(memo.reason) ? (memo.reason as DeviationCategory) : "Other";
}

export const MISSED_DEADLINE_SUBCATEGORIES = ["Absence memos deviation", "Accountability or TO submission deviation", "Other missed deadline"] as const;
export type MissedDeadlineSubcategory = (typeof MISSED_DEADLINE_SUBCATEGORIES)[number];

/** Which of the 2 machine triggers (or neither) produced this "Missed Deadline" memo -- `autoCategory` is set directly by the backend at creation time (afrotc-functions), not inferred from text. */
export function missedDeadlineSubcategory(memo: DeviationMemo): MissedDeadlineSubcategory {
  if (memo.autoCategory === "absence-memo") return "Absence memos deviation";
  if (memo.autoCategory === "accountability-or-to") return "Accountability or TO submission deviation";
  return "Other missed deadline";
}

/** Every row the bar graph and the table's columns are built from, in display order -- Missed Deadline's 3 subcategories first, then the other 3 categories as their own single row/column. */
export const DEVIATION_ROW_LABELS = [...MISSED_DEADLINE_SUBCATEGORIES, "Grooming & Appearance", "Customs & Courtesies", "Other"] as const;
export type DeviationRowLabel = (typeof DEVIATION_ROW_LABELS)[number];

/** The bar-graph/table row a single memo belongs to -- its Missed Deadline subcategory, or its category verbatim for the other 3. */
export function rowLabelOf(memo: DeviationMemo): DeviationRowLabel {
  const category = categoryOf(memo);
  return category === "Missed Deadline" ? missedDeadlineSubcategory(memo) : category;
}

export interface CategoryCount {
  category: DeviationCategory;
  count: number;
}

/** The 4 top box counts. */
export function countByCategory(memos: DeviationMemo[]): CategoryCount[] {
  const counts = new Map<DeviationCategory, number>(DEVIATION_REASONS.map((c) => [c, 0]));
  for (const memo of memos) counts.set(categoryOf(memo), (counts.get(categoryOf(memo)) ?? 0) + 1);
  return DEVIATION_REASONS.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

export interface RowCount {
  label: DeviationRowLabel;
  count: number;
}

/** The horizontal bar graph's rows, in display order -- 6 rows total (3 Missed Deadline subcategories + 3 other categories). */
export function countByRow(memos: DeviationMemo[]): RowCount[] {
  const counts = new Map<DeviationRowLabel, number>(DEVIATION_ROW_LABELS.map((l) => [l, 0]));
  for (const memo of memos) counts.set(rowLabelOf(memo), (counts.get(rowLabelOf(memo)) ?? 0) + 1);
  return DEVIATION_ROW_LABELS.map((label) => ({ label, count: counts.get(label) ?? 0 }));
}

export interface UnitCount {
  unit: string;
  count: number;
}

/** Deviation counts grouped by the target cadet's Flight or Group -- feeds the pie chart's toggle. A memo whose cadet has no roster match, or no value on the chosen axis, is skipped. */
export function countByUnit(memos: DeviationMemo[], roster: Cadet[], axis: "flight" | "group"): UnitCount[] {
  const rosterById = new Map(roster.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  for (const memo of memos) {
    const cadet = rosterById.get(memo.cadetId);
    const unit = axis === "flight" ? cadet?.flight : cadet?.group;
    if (!unit) continue;
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  return [...counts.entries()].map(([unit, count]) => ({ unit, count })).sort((a, b) => b.count - a.count);
}

export interface CadetDeviationRow {
  cadet: Cadet;
  counts: Record<DeviationRowLabel, number>;
  total: number;
}

function emptyRowCounts(): Record<DeviationRowLabel, number> {
  return Object.fromEntries(DEVIATION_ROW_LABELS.map((l) => [l, 0])) as Record<DeviationRowLabel, number>;
}

/** The big table's rows -- one per cadet who has at least 1 deviation memo (a cadet with zero is simply absent; the screen's own "show all" toggle adds the rest back in with every count at 0). */
export function cadetDeviationRows(memos: DeviationMemo[], roster: Cadet[]): CadetDeviationRow[] {
  const rosterById = new Map(roster.map((c) => [c.id, c]));
  const rows = new Map<string, CadetDeviationRow>();
  for (const memo of memos) {
    const cadet = rosterById.get(memo.cadetId);
    if (!cadet) continue;
    let row = rows.get(cadet.id);
    if (!row) {
      row = { cadet, counts: emptyRowCounts(), total: 0 };
      rows.set(cadet.id, row);
    }
    const label = rowLabelOf(memo);
    row.counts[label] += 1;
    row.total += 1;
  }
  return [...rows.values()];
}
