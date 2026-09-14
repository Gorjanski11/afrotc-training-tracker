import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCadets } from "./hooks/useCadets";
import { useTrainingObjectives, type TrainingObjectiveSeed } from "./hooks/useTrainingObjectives";
import { useCompletions } from "./hooks/useCompletions";
import { usePmtEvents } from "./hooks/usePmtEvents";
import { DashboardScreen } from "./screens/DashboardScreen";
import { CadetDetailScreen } from "./screens/CadetDetailScreen";
import { ReferenceLibraryScreen } from "./screens/ReferenceLibraryScreen";
import { RosterScreen } from "./screens/RosterScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import trainingObjectivesSeed from "./data/trainingObjectivesSeed.json";

type Screen = "dashboard" | "cadet" | "reference" | "calendar" | "roster";

// No login of any kind -- everyone who has the link can view and edit
// everything (Dashboard, Cadet Detail, Reference Library, Calendar, Roster).
// Intentional choice for a small-detachment tool with an unlisted URL; see
// firestore.rules and README.md for the tradeoff this implies.
function App() {
  const cadetsState = useCadets();
  const catalogState = useTrainingObjectives();
  const completionsState = useCompletions();
  const pmtEventsState = usePmtEvents();

  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedCadetId, setSelectedCadetId] = useState<string | undefined>();

  const goToCadet = (cadetId: string) => {
    setSelectedCadetId(cadetId);
    setScreen("cadet");
  };

  const dataLoading = cadetsState.loading || catalogState.loading || completionsState.loading || pmtEventsState.loading;
  const loadError = cadetsState.error || catalogState.error || completionsState.error || pmtEventsState.error;

  const deleteCadet = async (cadetId: string) => {
    await completionsState.deleteCompletionsForCadet(cadetId);
    await cadetsState.deleteCadet(cadetId);
  };

  const importCatalog = async () => {
    const seed = trainingObjectivesSeed as TrainingObjectiveSeed[];
    await catalogState.seedFromJson(seed);
    return seed.length;
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-input px-8 py-3">
        <div className="flex items-baseline gap-4">
          <h1 className="text-xl font-semibold">AFROTC Training Objective Tracker</h1>
          <span className="text-sm text-muted-foreground">AFROTCI 36-2011 Vol 1</span>
        </div>
      </header>

      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-8">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="cadet" disabled={!selectedCadetId}>
              Cadet Detail
            </TabsTrigger>
            <TabsTrigger value="reference">Reference Library</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="roster">Roster</TabsTrigger>
          </TabsList>
        </nav>

        <main className="flex-1 overflow-auto p-6">
          {dataLoading ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-muted-foreground">Loading data...</span>
            </div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-destructive">{loadError}</span>
            </div>
          ) : (
            <>
              <TabsContent value="dashboard">
                <DashboardScreen
                  cadets={cadetsState.cadets}
                  catalog={catalogState.catalog}
                  completions={completionsState.completions}
                  pmtEvents={pmtEventsState.events}
                  onSelectCadet={goToCadet}
                />
              </TabsContent>
              <TabsContent value="cadet">
                {selectedCadetId && (
                  <CadetDetailScreen
                    cadetId={selectedCadetId}
                    cadets={cadetsState.cadets}
                    sections={catalogState.sections}
                    completions={completionsState.completions}
                    pmtEvents={pmtEventsState.events}
                    createCompletion={completionsState.createCompletion}
                    updateCompletion={completionsState.updateCompletion}
                    onSelectCadet={goToCadet}
                  />
                )}
              </TabsContent>
              <TabsContent value="reference">
                <ReferenceLibraryScreen sections={catalogState.sections} />
              </TabsContent>
              <TabsContent value="calendar">
                <CalendarScreen
                  events={pmtEventsState.events}
                  catalog={catalogState.catalog}
                  createEvent={pmtEventsState.createEvent}
                  updateEvent={pmtEventsState.updateEvent}
                  deleteEvent={pmtEventsState.deleteEvent}
                />
              </TabsContent>
              <TabsContent value="roster">
                <RosterScreen
                  cadets={cadetsState.cadets}
                  catalog={catalogState.catalog}
                  completions={completionsState.completions}
                  pmtEvents={pmtEventsState.events}
                  createCadet={cadetsState.createCadet}
                  updateCadet={cadetsState.updateCadet}
                  deleteCadet={deleteCadet}
                  onSelectCadet={goToCadet}
                  importCatalog={importCatalog}
                />
              </TabsContent>
            </>
          )}
        </main>
      </Tabs>
    </div>
  );
}

export default App;
