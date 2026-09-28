import { AS_CLASSES, DEV_LEVELS, FLIGHTS, GROUPS, PMT_EVENT_TYPES, deriveClass, type AsClass, type DevLevel, type Flight, type Group, type PmtEventType } from "./constants";
import type { Cadet, TrainingObjective } from "./types";

// ---------------------------------------------------------------------------
// File format -- fixed column order, tab-delimited .txt (build in Excel, save
// as "Text (Tab delimited)"). Header row is expected but its exact wording is
// never read -- only position matters.
// ---------------------------------------------------------------------------

export const CADET_ROSTER_COLUMNS = ["Last Name", "First Name", "Rank", "AS Level", "POC or GMC", "Group (if POC)", "Flight (if GMC)", "Position", "Dev Level", "Email"];
export const CADRE_ROSTER_COLUMNS = ["Rank", "Last Name", "First Name", "Email"];
export const EVENTS_COLUMNS = ["Date", "Time", "Title", "Type", "TW", "Location", "POCIC1", "POCIC2", "POCIC3", "POCSUP", "TOs Covered"];

const PLO_PREFIX: Record<string, number> = { LOC: 1, DP: 2, EC: 3, WF: 4, SMO: 5 };

export function parseTabDelimited(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t").map((cell) => cell.trim()));
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchEnum<T extends string>(raw: string, options: readonly T[]): T | undefined {
  const n = normalize(raw);
  return options.find((o) => normalize(o) === n);
}

// ---------------------------------------------------------------------------
// Cadet Roster
// ---------------------------------------------------------------------------

export interface CadetRosterRow {
  rowIndex: number;
  lastName: string;
  firstName: string;
  rank: string;
  asLevelRaw: string;
  pocGmcRaw: string;
  groupRaw: string;
  flightRaw: string;
  position: string;
  devLevelRaw: string;
  email: string;
}

export type CadetDiffAction = "create" | "update" | "delete";

export interface CadetDiffRow {
  key: string; // stable key for React + edit lookups
  action: CadetDiffAction;
  rowIndex: number | undefined; // undefined for a "delete" row (came from the existing roster, not the file)
  existing: Cadet | undefined;
  // Editable proposed fields (create/update only) -- flagged problems surface as validation on these.
  name: string;
  rank: string;
  asClass: string; // kept as free text in the editable row so a typo is correctable inline; validated against AS_CLASSES at commit time
  devLevel: string;
  pocGmcRaw: string;
  group: string;
  flight: string;
  position: string;
  email: string;
  flags: string[];
}

function parseCadetRosterRows(rows: string[][]): CadetRosterRow[] {
  return rows.slice(1).map((cells, i) => ({
    rowIndex: i,
    lastName: cells[0] ?? "",
    firstName: cells[1] ?? "",
    rank: cells[2] ?? "",
    asLevelRaw: cells[3] ?? "",
    pocGmcRaw: cells[4] ?? "",
    groupRaw: cells[5] ?? "",
    flightRaw: cells[6] ?? "",
    position: cells[7] ?? "",
    devLevelRaw: cells[8] ?? "",
    email: cells[9] ?? "",
  }));
}

/**
 * Diffs the new Cadet Roster file against the current non-Cadre roster, matched by email (exact,
 * case-insensitive) -- never by name, so a typo'd email is deliberately treated as a new person
 * rather than guessed at (Section confirmed with cadre: they resolve typos manually afterward).
 * status/isCwl/statusChangedDate/notes are wiped back to defaults for every row the file touches
 * (create or update) since none of them come from the file and may no longer be accurate.
 */
export function buildCadetRosterDiff(fileText: string, currentRoster: Cadet[]): CadetDiffRow[] {
  const rows = parseCadetRosterRows(parseTabDelimited(fileText));
  const nonCadre = currentRoster.filter((c) => !c.isCadre);
  const byEmail = new Map(nonCadre.filter((c) => c.email).map((c) => [c.email!.trim().toLowerCase(), c]));
  const seenEmails = new Set<string>();

  const result: CadetDiffRow[] = [];

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const flags: string[] = [];
    if (!email) flags.push("Missing email -- can't match or create a login without one.");
    if (!row.lastName.trim() || !row.firstName.trim()) flags.push("Missing last/first name.");

    const asClass = matchEnum(row.asLevelRaw, AS_CLASSES);
    if (!asClass) flags.push(`AS Level "${row.asLevelRaw}" doesn't match any known AS class.`);
    const devLevel = matchEnum(row.devLevelRaw, DEV_LEVELS);
    if (!devLevel) flags.push(`Dev Level "${row.devLevelRaw}" doesn't match BC/BCL/ICL/SCL.`);
    const group = row.groupRaw.trim() ? matchEnum(row.groupRaw, GROUPS) : undefined;
    if (row.groupRaw.trim() && !group) flags.push(`Group "${row.groupRaw}" doesn't match a known group.`);
    const flight = row.flightRaw.trim() ? matchEnum(row.flightRaw, FLIGHTS) : undefined;
    if (row.flightRaw.trim() && !flight) flags.push(`Flight "${row.flightRaw}" doesn't match a known flight.`);

    if (asClass) {
      const derived = deriveClass(asClass, false);
      const statedPocGmc = row.pocGmcRaw.trim().toUpperCase();
      if (statedPocGmc && statedPocGmc !== derived) {
        flags.push(`POC/GMC column says "${row.pocGmcRaw}" but AS Level ${asClass} derives to ${derived} -- double check.`);
      }
    }

    if (email) {
      if (seenEmails.has(email)) flags.push("Duplicate email -- appears more than once in this file.");
      seenEmails.add(email);
    }

    const existing = email ? byEmail.get(email) : undefined;

    result.push({
      key: `cadet-${row.rowIndex}`,
      action: existing ? "update" : "create",
      rowIndex: row.rowIndex,
      existing,
      name: `${row.lastName.trim()}, ${row.firstName.trim()}`,
      rank: row.rank.trim(),
      asClass: asClass ?? row.asLevelRaw.trim(),
      devLevel: devLevel ?? row.devLevelRaw.trim(),
      pocGmcRaw: row.pocGmcRaw.trim(),
      group: group ?? row.groupRaw.trim(),
      flight: flight ?? row.flightRaw.trim(),
      position: row.position.trim(),
      email: row.email.trim(),
      flags,
    });
  }

  for (const cadet of nonCadre) {
    const email = cadet.email?.trim().toLowerCase();
    if (email && seenEmails.has(email)) continue;
    result.push({
      key: `cadet-delete-${cadet.id}`,
      action: "delete",
      rowIndex: undefined,
      existing: cadet,
      name: cadet.name,
      rank: cadet.rank ?? "",
      asClass: cadet.asClass ?? "",
      devLevel: cadet.devLevel ?? "",
      pocGmcRaw: "",
      group: cadet.group ?? "",
      flight: cadet.flight ?? "",
      position: cadet.position ?? "",
      email: cadet.email ?? "",
      flags: [],
    });
  }

  return result;
}

/** Recomputes a Cadet Roster row's flags after an inline edit in the review screen -- asClass/devLevel/group/flight are edited via constrained dropdowns so they can't go invalid again, this just re-checks everything else (name, email, duplicates, POC/GMC cross-check). */
export function revalidateCadetDiffRow(row: CadetDiffRow, allRows: CadetDiffRow[]): string[] {
  const flags: string[] = [];
  const email = row.email.trim().toLowerCase();
  if (!email) flags.push("Missing email -- can't match or create a login without one.");
  if (!row.name.trim()) flags.push("Missing name.");
  if (email && allRows.some((r) => r !== row && r.action !== "delete" && r.email.trim().toLowerCase() === email)) {
    flags.push("Duplicate email -- appears more than once in this file.");
  }
  if (row.asClass && matchEnum(row.asClass, AS_CLASSES)) {
    const derived = deriveClass(row.asClass as AsClass, false);
    const statedPocGmc = row.pocGmcRaw.trim().toUpperCase();
    if (statedPocGmc && statedPocGmc !== derived) {
      flags.push(`POC/GMC column says "${row.pocGmcRaw}" but AS Level ${row.asClass} derives to ${derived} -- double check.`);
    }
  }
  return flags;
}

/** Same idea for a Cadre Roster row. */
export function revalidateCadreDiffRow(row: CadreDiffRow, allRows: CadreDiffRow[]): string[] {
  const flags: string[] = [];
  const email = row.email.trim().toLowerCase();
  if (row.action === "missing") return row.flags; // informational only, never edited
  if (!email) flags.push("Missing email -- can't match or create a login without one.");
  if (!row.name.trim()) flags.push("Missing name.");
  if (email && allRows.some((r) => r !== row && r.action !== "missing" && r.email.trim().toLowerCase() === email)) {
    flags.push("Duplicate email -- appears more than once in this file.");
  }
  return flags;
}

/** Same idea for an Events row. */
export function revalidateEventRow(row: EventPlanRow, catalog: TrainingObjective[]): string[] {
  const flags: string[] = [];
  if (!parseEventDateTime(row.date, row.time)) flags.push(`Can't parse date/time "${row.date} ${row.time}" -- expected MM/DD/YYYY and HHmm (e.g. 09/29/2026, 1730).`);
  if (!matchEnum(row.typeRaw, PMT_EVENT_TYPES)) flags.push(`Type "${row.typeRaw}" doesn't match PT/LLAB/FM/D&C.`);
  if (!row.title.trim()) flags.push("Missing title.");
  const { unrecognized } = parseTosCovered(row.toCoveredRaw, catalog);
  for (const bad of unrecognized) flags.push(`TO "${bad}" not found in the catalog -- dropped from this event.`);
  return flags;
}

// ---------------------------------------------------------------------------
// Cadre Roster
// ---------------------------------------------------------------------------

export type CadreDiffAction = "create" | "update" | "missing";

export interface CadreDiffRow {
  key: string;
  action: CadreDiffAction;
  rowIndex: number | undefined;
  existing: Cadet | undefined;
  name: string; // full proposed/existing display name, "{Rank} {Last}, {First}"
  email: string;
  flags: string[];
}

function parseCadreRosterRows(rows: string[][]): { rowIndex: number; rank: string; lastName: string; firstName: string; email: string }[] {
  return rows.slice(1).map((cells, i) => ({
    rowIndex: i,
    rank: cells[0] ?? "",
    lastName: cells[1] ?? "",
    firstName: cells[2] ?? "",
    email: cells[3] ?? "",
  }));
}

/**
 * Cadre missing from the new file are only ever FLAGGED, never auto-deleted or disabled (confirmed
 * with cadre -- they review and act on those manually, unlike the Cadet Roster's auto-delete).
 */
export function buildCadreRosterDiff(fileText: string, currentRoster: Cadet[]): CadreDiffRow[] {
  const rows = parseCadreRosterRows(parseTabDelimited(fileText));
  const cadre = currentRoster.filter((c) => c.isCadre);
  const byEmail = new Map(cadre.filter((c) => c.email).map((c) => [c.email!.trim().toLowerCase(), c]));
  const seenEmails = new Set<string>();

  const result: CadreDiffRow[] = [];

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const flags: string[] = [];
    if (!email) flags.push("Missing email -- can't match or create a login without one.");
    if (!row.lastName.trim()) flags.push("Missing last name.");
    if (!row.rank.trim()) flags.push("Missing rank.");
    if (email) {
      if (seenEmails.has(email)) flags.push("Duplicate email -- appears more than once in this file.");
      seenEmails.add(email);
    }

    const existing = email ? byEmail.get(email) : undefined;
    const name = `${row.rank.trim()} ${row.lastName.trim()}${row.firstName.trim() ? `, ${row.firstName.trim()}` : ""}`;

    result.push({
      key: `cadre-${row.rowIndex}`,
      action: existing ? "update" : "create",
      rowIndex: row.rowIndex,
      existing,
      name,
      email: row.email.trim(),
      flags,
    });
  }

  for (const person of cadre) {
    const email = person.email?.trim().toLowerCase();
    if (email && seenEmails.has(email)) continue;
    result.push({
      key: `cadre-missing-${person.id}`,
      action: "missing",
      rowIndex: undefined,
      existing: person,
      name: person.name,
      email: person.email ?? "",
      flags: ["Not in the new Cadre Roster file -- no automatic action will be taken. Manage manually if they've actually left."],
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventPlanRow {
  key: string;
  rowIndex: number;
  date: string; // MM/DD/YYYY as typed
  time: string; // HHmm as typed
  title: string;
  typeRaw: string;
  twRaw: string;
  location: string;
  pocic: string;
  pocic2: string;
  pocic3: string;
  pocsup: string;
  toCoveredRaw: string;
  flags: string[];
}

/** "MM/DD/YYYY" + "HHmm" (24-hour, no colon, e.g. "1730") -> ISO datetime. Undefined if either fails to parse. */
export function parseEventDateTime(dateStr: string, timeStr: string): string | undefined {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):?(\d{2})$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return undefined;
  const [, mm, dd, yyyy] = dateMatch;
  const [, hh, min] = timeMatch;
  const hours = Number(hh);
  const minutes = Number(min);
  if (hours > 23 || minutes > 59) return undefined;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hours, minutes, 0, 0);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** "LOC 3.1, DP 2.1" -> catalog doc ids, cross-checked against the live catalog -- an unrecognized token is dropped and flagged rather than voiding the whole row. */
export function parseTosCovered(raw: string, catalog: TrainingObjective[]): { objectiveIds: string[]; unrecognized: string[] } {
  const catalogIds = new Set(catalog.map((o) => o.id));
  const objectiveIds: string[] = [];
  const unrecognized: string[] = [];
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const match = /^([A-Za-z]+)\s+(\d+(?:\.\d+)?)$/.exec(trimmed);
    const ploOrder = match ? PLO_PREFIX[match[1].toUpperCase()] : undefined;
    const id = ploOrder ? `${ploOrder}-${match![2]}` : undefined;
    if (id && catalogIds.has(id)) objectiveIds.push(id);
    else unrecognized.push(trimmed);
  }
  return { objectiveIds, unrecognized };
}

function parseEventsRows(rows: string[][]): EventPlanRow[] {
  return rows.slice(1).map((cells, i) => ({
    key: `event-${i}`,
    rowIndex: i,
    date: cells[0] ?? "",
    time: cells[1] ?? "",
    title: cells[2] ?? "",
    typeRaw: cells[3] ?? "",
    twRaw: cells[4] ?? "",
    location: cells[5] ?? "",
    pocic: cells[6] ?? "",
    pocic2: cells[7] ?? "",
    pocic3: cells[8] ?? "",
    pocsup: cells[9] ?? "",
    toCoveredRaw: cells[10] ?? "",
    flags: [],
  }));
}

/** Events always fully replace the calendar (every existing PmtEvent gets deleted first) -- no diffing, just build+validate the new list. */
export function buildEventsPlan(fileText: string, catalog: TrainingObjective[]): EventPlanRow[] {
  const rows = parseEventsRows(parseTabDelimited(fileText));
  for (const row of rows) {
    if (!parseEventDateTime(row.date, row.time)) row.flags.push(`Can't parse date/time "${row.date} ${row.time}" -- expected MM/DD/YYYY and HHmm (e.g. 09/29/2026, 1730).`);
    if (!matchEnum(row.typeRaw, PMT_EVENT_TYPES)) row.flags.push(`Type "${row.typeRaw}" doesn't match PT/LLAB/FM/D&C.`);
    if (!row.title.trim()) row.flags.push("Missing title.");
    const { unrecognized } = parseTosCovered(row.toCoveredRaw, catalog);
    for (const bad of unrecognized) row.flags.push(`TO "${bad}" not found in the catalog -- dropped from this event.`);
  }
  return rows;
}

export interface CadetInputLike {
  name: string;
  rank: string | undefined;
  asClass: AsClass;
  devLevel: DevLevel;
  status: "Active";
  notes: string;
  email: string;
  flight: Flight | undefined;
  group: Group | undefined;
  isCadre: boolean;
  isCwl: boolean;
  position: string | undefined;
  statusChangedDate: string | undefined;
  mustChangePassword?: boolean;
}

/** Builds the exact Firestore-ready fields for a create/update Cadet Roster row -- only called once a row has no blocking flags left. */
export function cadetDiffRowToInput(row: CadetDiffRow): CadetInputLike {
  return {
    name: row.name,
    rank: row.rank || undefined,
    asClass: row.asClass as AsClass,
    devLevel: row.devLevel as DevLevel,
    status: "Active",
    notes: "",
    email: row.email,
    flight: row.flight ? (row.flight as Flight) : undefined,
    group: row.group ? (row.group as Group) : undefined,
    isCadre: false,
    isCwl: false,
    position: row.position || undefined,
    statusChangedDate: undefined,
    ...(row.action === "create" ? { mustChangePassword: true } : {}),
  };
}

export interface EventInputLike {
  title: string;
  eventDate: string;
  eventType: PmtEventType;
  location: string;
  pocic: string;
  pocic2: string;
  pocic3: string;
  pocsup: string;
  trainingWeek: number | undefined;
  objectiveIds: string[];
  notes: string;
}

/** Builds the exact Firestore-ready fields for an Events row -- only called once a row has no blocking flags left. */
export function eventRowToInput(row: EventPlanRow, catalog: TrainingObjective[]): EventInputLike {
  const eventDate = parseEventDateTime(row.date, row.time)!;
  const eventType = matchEnum(row.typeRaw, PMT_EVENT_TYPES)!;
  const tw = Number(row.twRaw.trim());
  const { objectiveIds } = parseTosCovered(row.toCoveredRaw, catalog);
  return {
    title: row.title.trim(),
    eventDate,
    eventType,
    location: row.location.trim(),
    pocic: row.pocic.trim(),
    pocic2: row.pocic2.trim(),
    pocic3: row.pocic3.trim(),
    pocsup: row.pocsup.trim(),
    trainingWeek: Number.isFinite(tw) && row.twRaw.trim() !== "" ? tw : undefined,
    objectiveIds,
    notes: "",
  };
}
