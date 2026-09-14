// Cadet names are "C/<Rank> Last Name, First." (e.g. "C/Lt Col Santiago Ruiz, J.")
// or, for cadets added directly via the Roster form, plain "Last, First" with no
// rank prefix. A plain string sort on the raw name groups by rank first (since
// "C/1st Lt" < "C/2d Lt" < "C/Capt" < "C/Col" < "C/Lt Col" < "C/Maj" alphabetically) --
// this strips the rank so sorting actually goes by last name.
const RANK_PREFIX = /^C\/(?:Col|Lt\s+Col|Maj|Capt|1st\s+Lt|2d\s+Lt|2nd\s+Lt)\s+/i;

export function lastNameSortKey(fullName: string): string {
  return fullName.replace(RANK_PREFIX, "").trim();
}

export function compareByLastName(a: string, b: string): number {
  return lastNameSortKey(a).localeCompare(lastNameSortKey(b));
}
