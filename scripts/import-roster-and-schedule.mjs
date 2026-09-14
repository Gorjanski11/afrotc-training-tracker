// One-off import of the real POC roster and Fall 2026 PMT schedule into
// production Firestore. Uses the same client SDK + config the app itself
// uses (writes are open per firestore.rules, no admin credentials needed).
// Safe to re-run accidentally creating duplicates is the only risk -- this
// is NOT idempotent (uses addDoc/auto-IDs), so only run it once.
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB7nortxOkZX0wzLfWZJ4kQh5uePGQRK2k",
  authDomain: "afrotc-traning-tracker.firebaseapp.com",
  projectId: "afrotc-traning-tracker",
  storageBucket: "afrotc-traning-tracker.firebasestorage.app",
  messagingSenderId: "339778762887",
  appId: "1:339778762887:web:5e630efd6004ae6e602022",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// name -> devLevel, per the real roster given by the SAE.
const cadets = [
  { name: "Ballester Martínez, Dylan", devLevel: "SCL" },
  { name: "Belen Caraballo, Hector", devLevel: "SCL" },
  { name: "Cruz Peña, Alana", devLevel: "SCL" },
  { name: "Gonzalez Torres, Luis", devLevel: "SCL" },
  { name: "Mo Velez, Jossie", devLevel: "SCL" },
  { name: "Puente Bonilla, Edgardo", devLevel: "SCL" },
  { name: "Saltiel Lima, Francisco", devLevel: "SCL" },
  { name: "Santiago Ruiz, John", devLevel: "SCL" },
  { name: "Acevedo Martinez, Julian", devLevel: "ICL" },
  { name: "Cortes Garay, Jorge", devLevel: "ICL" },
  { name: "Cruz Mendez, Sebastian", devLevel: "ICL" },
  { name: "Delgado Ortiz, Lorean", devLevel: "ICL" },
  { name: "Feliciano Feliciano, Edgardo", devLevel: "ICL" },
  { name: "Ferrer Aponte, Sebastian", devLevel: "ICL" },
  { name: "Garcia Feliberty, Jakob", devLevel: "ICL" },
  { name: "Huertas Pabón, Angel", devLevel: "ICL" },
  { name: "Merle Cintron, Fabiola", devLevel: "ICL" },
  { name: "Montalvo Nieves, Sebastian", devLevel: "ICL" },
  { name: "Rodriguez Rivera, Alexis", devLevel: "ICL" },
  { name: "Rodriguez Vazquez, Gilbert", devLevel: "ICL" },
  { name: "Vivas Gandarillas, Julian", devLevel: "ICL" },
].map((c) => ({ ...c, asClass: c.devLevel === "SCL" ? "AS400" : "AS300", status: "Active", notes: "" }));

// Training Objective doc IDs are `${ploOrder}-${number}` (ploOrder: LC=1, DP=2, WF=4).
const LC = (n) => `1-${n}`;
const DP = (n) => `2-${n}`;
const WF = (n) => `4-${n}`;

// Events, matched by date against the old schedule's POCIC/supervisor/type
// data, with objectives given directly by the SAE using the new PLO scheme.
// "Dining In" (12/11) is intentionally omitted -- not in the SAE's new list.
const events = [
  { tw: 0, date: "2026-08-27", location: "Sanchez Hall, Room 104", title: "Pre-LLAB", type: "LLAB",
    pocic: "Saltiel Lima, Francisco", pocic2: "Mo Velez, Jossie", pocic3: "Santiago Ruiz, John", pocsup: "Ferrer Aponte, Sebastian",
    objectives: [LC("1.1"), LC("1.2"), DP("3.1"), DP("3.2"), DP("5.1")] },
  { tw: 1, date: "2026-09-01", location: "Piñero Amphitheater", title: "LLAB 1: Introduction Fall 2026", type: "LLAB",
    pocic: "Saltiel Lima, Francisco", pocic2: "Mo Velez, Jossie", pocic3: "Santiago Ruiz, John", pocsup: "Ballester Martínez, Dylan",
    objectives: [LC("1.1"), LC("1.2"), DP("3.1"), DP("3.2"), DP("5.1")] },
  { tw: 1, date: "2026-09-03", location: "ADEM Amphitheater", title: "LLAB 2: Wing Standarization", type: "LLAB",
    pocic: "Mo Velez, Jossie", pocic2: "Puente Bonilla, Edgardo", pocic3: "Cortes Garay, Jorge", pocsup: "Ballester Martínez, Dylan",
    objectives: [LC("1.1"), LC("1.2"), DP("3.1"), DP("3.2"), DP("5.1")] },
  { tw: 2, date: "2026-09-10", location: "Mezzanine", title: "Drill And Ceremonies (B1): Static Movements", type: "D&C",
    pocic: "Santiago Ruiz, John", pocic2: "Belen Caraballo, Hector", pocic3: "Huertas Pabón, Angel", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [] },
  { tw: 3, date: "2026-09-15", location: "Mezzanine", title: "Flight Meeting", type: "FM",
    pocic: "", pocic2: "", pocic3: "", pocsup: "Gonzalez Torres, Luis",
    objectives: [] },
  { tw: 3, date: "2026-09-17", location: "Mezzanine", title: "Drill And Ceremonies (B1): Individual Marching", type: "D&C",
    pocic: "Saltiel Lima, Francisco", pocic2: "Puente Bonilla, Edgardo", pocic3: "Acevedo Martinez, Julian", pocsup: "Gonzalez Torres, Luis",
    objectives: [] },
  { tw: 4, date: "2026-09-22", location: "Sendero de los Ejercicios", title: "LLAB 3: Base Defense/Weapon Management", type: "LLAB",
    pocic: "Cruz Mendez, Sebastian", pocic2: "Vivas Gandarillas, Julian", pocic3: "Cortes Garay, Jorge", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [WF("2.2"), WF("2.3")] },
  { tw: 4, date: "2026-09-24", location: "Mezzanine", title: "Drill And Ceremonies (B1): Formation Marching", type: "D&C",
    pocic: "Belen Caraballo, Hector", pocic2: "Montalvo Nieves, Sebastian", pocic3: "Cruz Peña, Alana", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [] },
  { tw: 5, date: "2026-09-29", location: "Sanchez Hall, Room 104", title: "LLAB 4: 9-Line/Comms/IED/UXO", type: "LLAB",
    pocic: "Cortes Garay, Jorge", pocic2: "Huertas Pabón, Angel", pocic3: "Cruz Mendez, Sebastian", pocsup: "Ballester Martínez, Dylan",
    objectives: [WF("2.3")] },
  { tw: 5, date: "2026-10-01", location: "Mezzanine", title: "Drill And Ceremonies: Block 1 Evaluation", type: "D&C",
    pocic: "Belen Caraballo, Hector", pocic2: "Montalvo Nieves, Sebastian", pocic3: "Merle Cintron, Fabiola", pocsup: "Ballester Martínez, Dylan",
    objectives: [] },
  { tw: 6, date: "2026-10-06", location: "Sanchez Hall, Room 104", title: "LLAB 5: Land Navigation Theory & GLP #1", type: "LLAB",
    pocic: "Puente Bonilla, Edgardo", pocic2: "Acevedo Martinez, Julian", pocic3: "Cruz Mendez, Sebastian", pocsup: "Gonzalez Torres, Luis",
    objectives: [LC("2.1")] },
  { tw: 6, date: "2026-10-08", location: "Mezzanine", title: "Flight Meeting", type: "FM",
    pocic: "", pocic2: "", pocic3: "", pocsup: "Gonzalez Torres, Luis",
    objectives: [] },
  { tw: 7, date: "2026-10-13", location: "Mezzanine", title: "Drill And Ceremonies (B2): Intermediate Marching", type: "D&C",
    pocic: "Mo Velez, Jossie", pocic2: "Delgado Ortiz, Lorean", pocic3: "Huertas Pabón, Angel", pocsup: "Ballester Martínez, Dylan",
    objectives: [] },
  { tw: 7, date: "2026-10-15", location: "Sendero de los Ejercicios", title: "LLAB 6: TCCC", type: "LLAB",
    pocic: "Mo Velez, Jossie", pocic2: "Delgado Ortiz, Lorean", pocic3: "Santiago Ruiz, John", pocsup: "Ballester Martínez, Dylan",
    objectives: [] },
  { tw: 8, date: "2026-10-20", location: "Sanchez Hall, Room 104", title: "GLP #2", type: "LLAB",
    pocic: "Montalvo Nieves, Sebastian", pocic2: "Acevedo Martinez, Julian", pocic3: "Cruz Peña, Alana", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [] },
  { tw: 8, date: "2026-10-22", location: "Mezzanine", title: "Drill And Ceremonies (B2): Advanced Marching", type: "D&C",
    pocic: "Montalvo Nieves, Sebastian", pocic2: "Huertas Pabón, Angel", pocic3: "Garcia Feliberty, Jakob", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [] },
  { tw: 9, date: "2026-10-27", location: "Mezzanine", title: "Flight Meeting", type: "FM",
    pocic: "", pocic2: "", pocic3: "", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [] },
  { tw: 9, date: "2026-10-29", location: "Sanchez Hall, Room 104", title: "GLP #3", type: "LLAB",
    pocic: "Cruz Peña, Alana", pocic2: "Cruz Mendez, Sebastian", pocic3: "Merle Cintron, Fabiola", pocsup: "Gonzalez Torres, Luis",
    objectives: [] },
  { tw: 10, date: "2026-11-03", location: "ININ Amphitheater", title: "LLAB 7: Warfighting Assets", type: "LLAB",
    pocic: "Saltiel Lima, Francisco", pocic2: "Santiago Ruiz, John", pocic3: "Garcia Feliberty, Jakob", pocsup: "Gonzalez Torres, Luis",
    objectives: [WF("1.1"), WF("1.3")] },
  { tw: 11, date: "2026-11-10", location: "Mezzanine", title: "Flight Meeting", type: "FM",
    pocic: "", pocic2: "", pocic3: "", pocsup: "Ballester Martínez, Dylan",
    objectives: [] },
  { tw: 11, date: "2026-11-12", location: "Mezzanine", title: "Drill And Ceremonies: Block 2 Evaluation", type: "D&C",
    pocic: "Puente Bonilla, Edgardo", pocic2: "Montalvo Nieves, Sebastian", pocic3: "Acevedo Martinez, Julian", pocsup: "Ballester Martínez, Dylan",
    objectives: [] },
  { tw: 12, date: "2026-11-17", location: "Sendero de los Ejercicios", title: "LLAB 8: Expeditionary Skills Review", type: "LLAB",
    pocic: "Huertas Pabón, Angel", pocic2: "Cruz Peña, Alana", pocic3: "Vivas Gandarillas, Julian", pocsup: "Gonzalez Torres, Luis",
    objectives: [WF("2.1"), WF("2.2"), WF("2.3")] },
  { tw: 13, date: "2026-11-24", location: "USDA", title: "LLAB 9: Field Training Exercise I", type: "LLAB",
    pocic: "Saltiel Lima, Francisco", pocic2: "Delgado Ortiz, Lorean", pocic3: "Cortes Garay, Jorge", pocsup: "Gonzalez Torres, Luis",
    objectives: [LC("2.1"), LC("2.2"), WF("2.1"), WF("2.2"), WF("2.3")] },
  { tw: 14, date: "2026-12-01", location: "USDA", title: "LLAB 10: Field Training Exercise II", type: "LLAB",
    pocic: "Santiago Ruiz, John", pocic2: "Belen Caraballo, Hector", pocic3: "Rodriguez Rivera, Alexis", pocsup: "Ballester Martínez, Dylan",
    objectives: [LC("2.1"), LC("2.2"), WF("2.1"), WF("2.2"), WF("2.3")] },
  { tw: 14, date: "2026-12-03", location: "Mezzanine", title: "GLP #4", type: "LLAB",
    pocic: "Belen Caraballo, Hector", pocic2: "Acevedo Martinez, Julian", pocic3: "Rodriguez Rivera, Alexis", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [] },
  { tw: 15, date: "2026-12-08", location: "Mezzanine", title: "Flight Meeting", type: "FM",
    pocic: "", pocic2: "", pocic3: "", pocsup: "Rodriguez Vazquez, Gilbert",
    objectives: [] },
  { tw: 15, date: "2026-12-10", location: "Mezzanine", title: "LLAB 11: Triple Challenge", type: "LLAB",
    pocic: "Delgado Ortiz, Lorean", pocic2: "Cortes Garay, Jorge", pocic3: "Cruz Peña, Alana", pocsup: "Ferrer Aponte, Sebastian",
    objectives: [DP("6.1")] },
];

async function main() {
  console.log(`Importing ${cadets.length} cadets...`);
  for (const c of cadets) {
    await addDoc(collection(db, "cadets"), {
      name: c.name,
      asClass: c.asClass,
      devLevel: c.devLevel,
      status: c.status,
      notes: c.notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`  + ${c.name} (${c.devLevel})`);
  }

  console.log(`\nImporting ${events.length} PMT events...`);
  for (const e of events) {
    await addDoc(collection(db, "pmtEvents"), {
      title: e.title,
      eventDate: new Date(`${e.date}T15:00:00`).toISOString(),
      eventType: e.type,
      location: e.location,
      pocic: e.pocic,
      pocic2: e.pocic2,
      pocic3: e.pocic3,
      pocsup: e.pocsup,
      trainingWeek: e.tw,
      objectiveIds: e.objectives,
      notes: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log(`  + TW${e.tw} ${e.date} -- ${e.title}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
