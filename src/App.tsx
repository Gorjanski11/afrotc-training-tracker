import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Sun, ShieldHalf, LayoutDashboard, UserRound, BarChart3, BookOpen, CalendarDays, Users, ListChecks } from "lucide-react";
import { useCadets } from "./hooks/useCadets";
import { useTrainingObjectives, type TrainingObjectiveSeed } from "./hooks/useTrainingObjectives";
import { useCompletions } from "./hooks/useCompletions";
import { usePmtEvents } from "./hooks/usePmtEvents";
import { useTheme } from "./hooks/useTheme";
import { DashboardScreen } from "./screens/DashboardScreen";
import { CadetDetailScreen } from "./screens/CadetDetailScreen";
import { ReferenceLibraryScreen } from "./screens/ReferenceLibraryScreen";
import { RosterScreen } from "./screens/RosterScreen";
import { CalendarScreen } from "./screens/CalendarScreen";
import { QuickLogScreen } from "./screens/QuickLogScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import trainingObjectivesSeed from "./data/trainingObjectivesSeed.json";

type Screen = "dashboard" | "cadet" | "reference" | "calendar" | "roster" | "quicklog" | "analytics";

/** Fades/settles a tab panel in on mount -- replays each time a tab becomes active, since Radix Tabs mounts each panel fresh. */
function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

// No login of any kind -- everyone who has the link can view and edit
// everything (Dashboard, Cadet Detail, Reference Library, Calendar, Roster).
// Intentional choice for a small-detachment tool with an unlisted URL; see
// firestore.rules and README.md for the tradeoff this implies.
function App() {
  const cadetsState = useCadets();
  const catalogState = useTrainingObjectives();
  const completionsState = useCompletions();
  const pmtEventsState = usePmtEvents();
  const { theme, toggleTheme } = useTheme();

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
      <header className="flex items-center justify-between border-b border-input bg-background px-8 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldHalf className="h-4 w-4" />
          </span>
          <div className="flex items-baseline gap-4">
            <h1 className="text-xl font-semibold">AFROTC Training Objective Tracker</h1>
            <span className="text-sm text-muted-foreground">AFROTCI 36-2011 Vol 1</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle dark mode" className="overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </header>

      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-8">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="cadet" disabled={!selectedCadetId}>
              <UserRound className="h-3.5 w-3.5" />
              Cadet Detail
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="reference">
              <BookOpen className="h-3.5 w-3.5" />
              Reference Library
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="h-3.5 w-3.5" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="roster">
              <Users className="h-3.5 w-3.5" />
              Roster
            </TabsTrigger>
            <TabsTrigger value="quicklog">
              <ListChecks className="h-3.5 w-3.5" />
              Quick Log
            </TabsTrigger>
          </TabsList>
        </nav>

        <main className="flex-1 overflow-auto p-6">
          {dataLoading ? (
            <div className="space-y-4">
              <div className="flex gap-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
              <Skeleton className="h-10 w-72" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-destructive">{loadError}</span>
            </div>
          ) : (
            <>
              <TabsContent value="dashboard">
                <AnimatedPanel>
                  <DashboardScreen
                    cadets={cadetsState.cadets}
                    catalog={catalogState.catalog}
                    completions={completionsState.completions}
                    pmtEvents={pmtEventsState.events}
                    onSelectCadet={goToCadet}
                  />
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="cadet">
                <AnimatedPanel>
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
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="analytics">
                <AnimatedPanel>
                  <AnalyticsScreen
                    cadets={cadetsState.cadets}
                    catalog={catalogState.catalog}
                    completions={completionsState.completions}
                    pmtEvents={pmtEventsState.events}
                    onSelectCadet={goToCadet}
                  />
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="reference">
                <AnimatedPanel>
                  <ReferenceLibraryScreen sections={catalogState.sections} />
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="calendar">
                <AnimatedPanel>
                  <CalendarScreen
                    events={pmtEventsState.events}
                    catalog={catalogState.catalog}
                    createEvent={pmtEventsState.createEvent}
                    updateEvent={pmtEventsState.updateEvent}
                    deleteEvent={pmtEventsState.deleteEvent}
                  />
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="roster">
                <AnimatedPanel>
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
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="quicklog">
                <AnimatedPanel>
                  <QuickLogScreen
                    cadets={cadetsState.cadets}
                    catalog={catalogState.catalog}
                    completions={completionsState.completions}
                    pmtEvents={pmtEventsState.events}
                    createCompletion={completionsState.createCompletion}
                    updateCompletion={completionsState.updateCompletion}
                    deleteCompletion={completionsState.deleteCompletion}
                    onSelectCadet={goToCadet}
                  />
                </AnimatedPanel>
              </TabsContent>
            </>
          )}
        </main>
      </Tabs>
    </div>
  );
}

export default App;
