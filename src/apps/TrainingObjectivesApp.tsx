import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, UserRound, BookOpen } from "lucide-react";
import { EdgeSidebar } from "@/components/mobile/EdgeSidebar";
import { FloatingDock } from "@/components/desktop/FloatingDock";
import { C3CRankIcon, CCaptRankIcon } from "@/components/mobile/rankIcons";
import { useCadets } from "../hooks/useCadets";
import { useTrainingObjectives } from "../hooks/useTrainingObjectives";
import { useCompletions } from "../hooks/useCompletions";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAttendance } from "../hooks/useAttendance";
import { GMC_DEV_LEVELS, POC_DEV_LEVELS, DEV_LEVELS, type DevLevel } from "../domain/constants";
import { applyUnitScope, excludeCadre, excludeInactive, type TrainingObjectivesAccess, type UnitScope } from "../domain/access";
import { LiquidToggle } from "../components/analytics/LiquidToggle";
import { DashboardScreen } from "../screens/DashboardScreen";
import { CadetDetailScreen } from "../screens/CadetDetailScreen";
import { ReferenceLibraryScreen } from "../screens/ReferenceLibraryScreen";
import { QuickLogScreen } from "../screens/QuickLogScreen";

type Screen = "dashboard" | "cadet" | "reference" | "pocLog" | "gmcLog";

const COHORT_DEV_LEVELS: Record<"poc" | "gmc", readonly DevLevel[]> = {
  poc: POC_DEV_LEVELS,
  gmc: GMC_DEV_LEVELS,
};

/** Fades/settles a tab panel in on mount -- replays each time a tab becomes active, since Radix Tabs mounts each panel fresh. */
function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

interface Props {
  /** "poc"/"gmc" only shows that cohort's Log tab and locks the Dashboard to it; "full" shows both Log tabs and adds a GMC/POC toggle to Dashboard. Never rendered at all when "none" -- the hub simply doesn't show this tab. */
  cohortAccess: TrainingObjectivesAccess;
  /** Group/Flight Commanders only ever see their own unit's cadets, everywhere in this sub-app (Section 5/8). */
  unitScope: UnitScope;
  userEmail: string | null | undefined;
}

/** POC/GMC "TO's" tracking -- Dashboard, Cadet Review, Reference Library, POC Log, GMC Log. Roster/Calendar moved to Settings (Section 6). */
export function TrainingObjectivesApp({ cohortAccess, unitScope, userEmail }: Props) {
  const cadetsState = useCadets();
  const catalogState = useTrainingObjectives();
  const completionsState = useCompletions();
  const pmtEventsState = usePmtEvents();
  const attendanceState = useAttendance();

  const showPoc = cohortAccess === "poc" || cohortAccess === "full";
  const showGmc = cohortAccess === "gmc" || cohortAccess === "full";
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [selectedCadetId, setSelectedCadetId] = useState<string | undefined>();
  // Dashboard-only GMC/POC toggle, for a viewer with access to both cohorts -- a poc-only or
  // gmc-only viewer's Dashboard is just always their one cohort, no toggle shown.
  const [dashboardCohort, setDashboardCohort] = useState<"poc" | "gmc">("poc");
  const effectiveDashboardCohort = cohortAccess === "full" ? dashboardCohort : cohortAccess === "gmc" ? "gmc" : "poc";

  const goToCadet = (cadetId: string) => {
    setSelectedCadetId(cadetId);
    setScreen("cadet");
  };

  /**
   * The whole roster this viewer has access to, cohort-filtered only down to whichever cohort(s)
   * their own access actually grants -- a "full" viewer's Cadet Review/Reference Library span both
   * cohorts (there's no cohort "door" to have entered through anymore), while a poc/gmc-only viewer
   * is still restricted to their one. Cadre supervise, they're never a tracked subject (Section 4) --
   * excluded right alongside unit scoping. An Inactive cadet is no longer tracked here either.
   */
  const accessLevels = useMemo(
    () => (cohortAccess === "full" ? DEV_LEVELS : cohortAccess === "gmc" ? GMC_DEV_LEVELS : cohortAccess === "poc" ? POC_DEV_LEVELS : []),
    [cohortAccess]
  );
  const accessCadets = useMemo(() => {
    const inAccess = cadetsState.cadets.filter((c) => c.devLevel && (accessLevels as readonly string[]).includes(c.devLevel));
    return excludeInactive(excludeCadre(applyUnitScope(unitScope, inAccess)));
  }, [cadetsState.cadets, unitScope, accessLevels]);

  const dashboardCadets = useMemo(
    () => accessCadets.filter((c) => c.devLevel && (COHORT_DEV_LEVELS[effectiveDashboardCohort] as readonly string[]).includes(c.devLevel)),
    [accessCadets, effectiveDashboardCohort]
  );
  const pocLogCadets = useMemo(
    () => accessCadets.filter((c) => c.devLevel && (POC_DEV_LEVELS as readonly string[]).includes(c.devLevel)),
    [accessCadets]
  );
  const gmcLogCadets = useMemo(
    () => accessCadets.filter((c) => c.devLevel && (GMC_DEV_LEVELS as readonly string[]).includes(c.devLevel)),
    [accessCadets]
  );

  // Evaluator autofill (Section 5) needs the POC-class evaluator pool from the FULL roster, not just
  // this app's accessible cadets -- a POC evaluator must be selectable even while logging a GMC cadet.
  const fullRosterNoCadre = useMemo(() => excludeInactive(excludeCadre(cadetsState.cadets)), [cadetsState.cadets]);

  const dataLoading = cadetsState.loading || catalogState.loading || completionsState.loading || pmtEventsState.loading || attendanceState.loading;
  const loadError = cadetsState.error || catalogState.error || completionsState.error || pmtEventsState.error || attendanceState.error;

  // Shared between the phone off-canvas sidebar and the desktop floating dock so the two never drift apart.
  const navItems = [
    { value: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    ...(selectedCadetId ? [{ value: "cadet" as const, label: "Cadet Review", icon: UserRound }] : []),
    { value: "reference" as const, label: "Reference Library", icon: BookOpen },
    ...(showPoc ? [{ value: "pocLog" as const, label: "POC Log", icon: CCaptRankIcon }] : []),
    ...(showGmc ? [{ value: "gmcLog" as const, label: "GMC Log", icon: C3CRankIcon }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      {dataLoading ? (
        <div className="space-y-4 p-3 sm:p-6">
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
        <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
          {/* Desktop only -- phone gets a single press-to-switch button next to the Dashboard's own Filters button instead (DashboardScreen). */}
          {screen === "dashboard" && cohortAccess === "full" && (
            <nav className="hidden items-center px-3 pt-2 desktop:flex desktop:px-8 desktop:pt-0">
              <LiquidToggle
                layoutId="to-dashboard-cohort-toggle"
                options={[
                  { value: "poc", label: "POC" },
                  { value: "gmc", label: "GMC" },
                ]}
                value={dashboardCohort}
                onChange={(v) => setDashboardCohort(v as "poc" | "gmc")}
              />
            </nav>
          )}

          {/* Phone-only: off-canvas subtab nav, swipe from the left edge (bottom edge in landscape); desktop gets the equivalent floating dock on the left edge instead. Each screen's own filters show via its own small "Filters" button (MobileFiltersButton) instead of living in either. */}
          <EdgeSidebar title="Training Objectives" active={screen} onChange={(v) => setScreen(v)} items={navItems} />
          <FloatingDock orientation="vertical" ariaLabel="Training Objectives navigation" active={screen} onChange={(v) => setScreen(v)} items={navItems} />

          <main className="flex-1 overflow-auto p-3 sm:p-6 desktop:pl-24">
            <TabsContent value="dashboard">
              <AnimatedPanel>
                <DashboardScreen
                  cohort={effectiveDashboardCohort}
                  levels={COHORT_DEV_LEVELS[effectiveDashboardCohort]}
                  cadets={dashboardCadets}
                  catalog={catalogState.catalog}
                  completions={completionsState.completions}
                  pmtEvents={pmtEventsState.events}
                  onSelectCadet={goToCadet}
                  showCohortToggle={cohortAccess === "full"}
                  onToggleCohort={() => setDashboardCohort((c) => (c === "poc" ? "gmc" : "poc"))}
                />
              </AnimatedPanel>
            </TabsContent>
            <TabsContent value="cadet">
              <AnimatedPanel>
                {selectedCadetId && (
                  <CadetDetailScreen
                    cadetId={selectedCadetId}
                    cadets={accessCadets}
                    sections={catalogState.sections}
                    completions={completionsState.completions}
                    pmtEvents={pmtEventsState.events}
                    createCompletion={completionsState.createCompletion}
                    updateCompletion={completionsState.updateCompletion}
                    onSelectCadet={goToCadet}
                    evaluatorOptions={fullRosterNoCadre}
                    userEmail={userEmail}
                  />
                )}
              </AnimatedPanel>
            </TabsContent>
            <TabsContent value="reference">
              <AnimatedPanel>
                <ReferenceLibraryScreen sections={catalogState.sections} devLevels={accessLevels} />
              </AnimatedPanel>
            </TabsContent>
            {showPoc && (
              <TabsContent value="pocLog">
                <AnimatedPanel>
                  <QuickLogScreen
                    cadets={pocLogCadets}
                    catalog={catalogState.catalog}
                    completions={completionsState.completions}
                    pmtEvents={pmtEventsState.events}
                    attendance={attendanceState.attendance}
                    createCompletion={completionsState.createCompletion}
                    updateCompletion={completionsState.updateCompletion}
                    deleteCompletion={completionsState.deleteCompletion}
                    refetchCompletions={completionsState.refetch}
                    onSelectCadet={goToCadet}
                    hideFlightFilter
                    userEmail={userEmail}
                    roster={fullRosterNoCadre}
                    mobileTitle="POC Log"
                    mobileTitleIcon={CCaptRankIcon}
                  />
                </AnimatedPanel>
              </TabsContent>
            )}
            {showGmc && (
              <TabsContent value="gmcLog">
                <AnimatedPanel>
                  <QuickLogScreen
                    cadets={gmcLogCadets}
                    catalog={catalogState.catalog}
                    completions={completionsState.completions}
                    pmtEvents={pmtEventsState.events}
                    attendance={attendanceState.attendance}
                    createCompletion={completionsState.createCompletion}
                    updateCompletion={completionsState.updateCompletion}
                    deleteCompletion={completionsState.deleteCompletion}
                    refetchCompletions={completionsState.refetch}
                    onSelectCadet={goToCadet}
                    hideFlightFilter={unitScope.kind === "flight"}
                    userEmail={userEmail}
                    roster={fullRosterNoCadre}
                    mobileTitle="GMC Log"
                    mobileTitleIcon={C3CRankIcon}
                  />
                </AnimatedPanel>
              </TabsContent>
            )}
          </main>
        </Tabs>
      )}
    </div>
  );
}
