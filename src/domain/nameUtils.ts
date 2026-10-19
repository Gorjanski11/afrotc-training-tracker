// `Cadet.name` is always plain "Last Name, First" -- rank lives in its own `Cadet.rank` field
// (formatCadetName below combines them for display) and never gets baked into `name` itself, so
// no rank-stripping is needed for sorting.
const RANK_PREFIX = /^C\/(?:Col|Lt\s+Col|Maj|Capt|1st\s+Lt|2d\s+Lt|2nd\s+Lt)\s+/i;

export function lastNameSortKey(fullName: string): string {
  return fullName.replace(RANK_PREFIX, "").trim();
}

export function compareByLastName(a: string, b: string): number {
  return lastNameSortKey(a).localeCompare(lastNameSortKey(b));
}

/**
 * The standard display format everywhere a cadet's name appears: "C/{rank} Last, First"
 * (e.g. "C/2d Lt Rodriguez Rivera, Alexis"). Cadre keep their real-officer/NCO `name` as-is (e.g.
 * "Capt Deaton") -- they're not cadets, so no "C/" prefix. Falls back to the plain "Last, First"
 * name with no prefix until a rank is entered via the Roster editor -- most of the roster has no
 * rank on file yet, so this fallback is the common case today, not an edge case.
 */
export function formatCadetName(cadet: { name: string; rank: string | undefined; isCadre: boolean }): string {
  if (cadet.isCadre || !cadet.rank) return cadet.name;
  return `C/${cadet.rank} ${cadet.name}`;
}

/**
 * Narrow-width display format: "C/{rank} Last Names" (e.g. "C/2d Lt Rodriguez Rivera"), dropping only
 * the first name that `formatCadetName` keeps -- both surnames stay (most of this roster uses the
 * two-surname Hispanic naming convention, and dropping the second would misidentify people who share
 * a first surname). Cadre names have no comma to split on, so they pass through unchanged, same as
 * `formatCadetName`.
 */
export function formatCadetNameCompact(cadet: { name: string; rank: string | undefined; isCadre: boolean }): string {
  if (cadet.isCadre) return cadet.name;
  const lastNames = cadet.name.split(",")[0]!.trim();
  return cadet.rank ? `C/${cadet.rank} ${lastNames}` : lastNames;
}
