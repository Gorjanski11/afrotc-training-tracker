import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, UserRound, BookOpen, CalendarDays, Users, ListChecks, ArrowLeft } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { useTrainingObjectives, type TrainingObjectiveSeed } from "../hooks/useTrainingObjectives";
import { useCompletions } from "../hooks/useCompletions";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { GMC_DEV_LEVELS, POC_DEV_LEVELS, type DevLevel } from "../domain/constants";
import { applyUnitScope, type TrainingObjectivesAccess, type UnitScope } from "../domain/access";
import { HomeScreen } from "../screens/HomeScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { CadetDetailScreen } from "../screens/CadetDetailScreen";
import { ReferenceLibraryScreen } from "../screens/ReferenceLibraryScreen";
import { RosterScreen } from "../screens/RosterScreen";
import { CalendarScreen } from "../screens/CalendarScreen";
import { QuickLogScreen } from "../screens/QuickLogScreen";
import trainingObjectivesSeed from "../data/trainingObjectivesSeed.json";

type TopLevel = "home" | "poc" | "gmc";
type Screen = "dashboard" | "cadet" | "reference" | "calendar" | "roster" | "quicklog";

const COHORT_DEV_LEVELS: Record<"poc" | "gmc", readonly DevLevel[]> = {
  poc: POC_DEV_LEVELS,
  gmc: GMC_DEV_LEVELS,
};
const COHORT_LABEL: Record<"poc" | "gmc", string> = { poc: "POC", gmc: "GMC" };

/** Fades/settles a tab panel in on mount -- replays each time a tab becomes active, since Radix Tabs mounts each panel fresh. */
function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

interface Props {
  /** "poc"/"gmc" skips the Home cohort-picker entirely and locks to that one cohort; "full" behaves as before (Home picker, either cohort). Never rendered at all when "none" -- the hub simply doesn't show this tab. */
  cohortAccess: TrainingObjectivesAccess;
  /** Group/Flight Commanders only ever see their own unit's cadets, everywhere in this sub-app (Section 5). */
  unitScope: UnitScope;
}

/** POC/GMC "TO's" tracking -- Dashboard, Cadet Detail, Reference Library, Calendar, Roster, Quick Log, Analytics. */
export function TrainingObjectivesApp({ cohortAccess, unitScope }: Props) {
  const cadetsState = useCadets();
  const catalogState = useTrainingObjectives();
  const completionsState = useCompletions();
  const pmtEventsState = usePmtEvents();

  const singleCohort = cohortAccess === "poc" || cohortAccess === "gmc" ? cohortAccess : undefined;
  const [topLevel, setTopLevel] = useState<TopLevel>(singleCohort ?? "home");
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedCadetId, setSelectedCadetId] = useState<string | undefined>();

  const goToCadet = (cadetId: string) => {
    setSelectedCadetId(cadetId);
    setScreen("cadet");
  };

  const enterCohort = (cohort: "poc" | "gmc") => {
    setTopLevel(cohort);
    setScreen("dashboard");
    setSelectedCadetId(undefined);
  };

  const goHome = () => {
    setTopLevel("home");
    setSelectedCadetId(undefined);
  };

  /**
   * "POC TO's" and "GMC TO's" are the same screens reading the same shared roster/catalog/PMT
   * calendar -- they're just scoped to their cohort's cadets here, not a parallel data model.
   */
  const cohortCadets = useMemo(() => {
    if (topLevel === "home") return [];
    const levels = COHORT_DEV_LEVELS[topLevel];
    const inCohort = cadetsState.cadets.filter((c) => c.devLevel && (levels as readonly string[]).includes(c.devLevel));
    return applyUnitScope(unitScope, inCohort);
  }, [topLevel, cadetsState.cadets, unitScope]);

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
    <div className="flex h-full flex-col">
      {(topLevel !== "home" || !singleCohort) && (
        <div className="flex items-center gap-3 border-b border-input bg-background px-8 py-2">
          {topLevel !== "home" && !singleCohort && (
            <Button variant="ghost" size="icon" onClick={goHome} aria-label="Back to Home">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            AFROTCI 36-2011 Vol 1{topLevel !== "home" && ` — ${COHORT_LABEL[topLevel]}`}
          </span>
        </div>
      )}

      {dataLoading ? (
        <div className="space-y-4 p-6">
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
      ) : topLevel === "home" ? (
        <main className="flex-1 overflow-auto p-6">
          <HomeScreen onEnterPoc={() => enterCohort("poc")} onEnterGmc={() => enterCohort("gmc")} />
        </main>
      ) : (
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
            <TabsContent value="dashboard">
              <AnimatedPanel>
                <DashboardScreen
                  cohort={topLevel}
                  levels={COHORT_DEV_LEVELS[topLevel]}
                  cadets={cohortCadets}
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
                    cadets={cohortCadets}
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
            <TabsContent value="reference">
              <AnimatedPanel>
                <ReferenceLibraryScreen sections={catalogState.sections} devLevels={COHORT_DEV_LEVELS[topLevel]} />
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
                  cohort={topLevel}
                  cadets={cohortCadets}
                  catalog={catalogState.catalog}
                  completions={completionsState.completions}
                  pmtEvents={pmtEventsState.events}
                  createCadet={cadetsState.createCadet}
                  updateCadet={cadetsState.updateCadet}
                  deleteCadet={deleteCadet}
                  onSelectCadet={goToCadet}
                  importCatalog={importCatalog}
                  allowedDevLevels={COHORT_DEV_LEVELS[topLevel]}
                />
              </AnimatedPanel>
            </TabsContent>
            <TabsContent value="quicklog">
              <AnimatedPanel>
                <QuickLogScreen
                  cadets={cohortCadets}
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
          </main>
        </Tabs>
      )}
    </div>
  );
}
