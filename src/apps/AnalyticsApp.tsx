import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, GraduationCap, FileText } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useTrainingObjectives } from "../hooks/useTrainingObjectives";
import { useCompletions } from "../hooks/useCompletions";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { applyUnitScope, excludeCadre, type TrainingObjectivesAccess, type UnitScope } from "../domain/access";
import { GMC_DEV_LEVELS, POC_DEV_LEVELS, DEV_LEVELS } from "../domain/constants";
import { AccountabilityAnalyticsView } from "../screens/analytics/AccountabilityAnalyticsView";
import { TrainingObjectivesAnalyticsView } from "../screens/analytics/TrainingObjectivesAnalyticsView";
import { MemorandumsAnalyticsView } from "../screens/analytics/MemorandumsAnalyticsView";

type Screen = "accountability" | "trainingObjectives" | "memorandums";

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

interface Props {
  accountabilityAccess: boolean;
  trainingObjectivesAccess: TrainingObjectivesAccess;
  memoReviewAccess: boolean;
  memoReviewAbsenceAccess: boolean;
  unitScope: UnitScope;
}

/** Consolidated hub-level Analytics tab (Section 6) -- replaces the old per-sub-app Analytics screens (Accountability's, Training Objectives') and Memo Review's History screen. */
export function AnalyticsApp({ accountabilityAccess, trainingObjectivesAccess, memoReviewAccess, memoReviewAbsenceAccess, unitScope }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const attendanceState = useAttendance();
  const catalogState = useTrainingObjectives();
  const completionsState = useCompletions();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();

  const first: Screen = accountabilityAccess ? "accountability" : trainingObjectivesAccess !== "none" ? "trainingObjectives" : "memorandums";
  const [screen, setScreen] = useState<Screen>(first);

  // Cadre supervise, they're never a tracked subject (Section 4) -- excluded right alongside unit scoping.
  const scopedCadets = useMemo(() => excludeCadre(applyUnitScope(unitScope, cadetsState.cadets)), [unitScope, cadetsState.cadets]);
  // Memorandums Analytics is deliberately NOT unit-scoped (a commander sees every memo, not just their own unit's), but Cadre still never appear in its cadet lookup.
  const memoRoster = useMemo(() => excludeCadre(cadetsState.cadets), [cadetsState.cadets]);

  const toCadets = useMemo(() => {
    if (trainingObjectivesAccess === "poc") return scopedCadets.filter((c) => c.devLevel && (POC_DEV_LEVELS as readonly string[]).includes(c.devLevel));
    if (trainingObjectivesAccess === "gmc") return scopedCadets.filter((c) => c.devLevel && (GMC_DEV_LEVELS as readonly string[]).includes(c.devLevel));
    return scopedCadets;
  }, [trainingObjectivesAccess, scopedCadets]);
  const availableDevLevels = trainingObjectivesAccess === "poc" ? POC_DEV_LEVELS : trainingObjectivesAccess === "gmc" ? GMC_DEV_LEVELS : DEV_LEVELS;

  const dataLoading =
    cadetsState.loading ||
    eventsState.loading ||
    attendanceState.loading ||
    catalogState.loading ||
    completionsState.loading ||
    absenceState.loading ||
    deviationState.loading;
  const loadError =
    cadetsState.error || eventsState.error || attendanceState.error || catalogState.error || completionsState.error || absenceState.error || deviationState.error;

  return (
    <div className="flex h-full flex-col">
      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-8 pt-2">
          <TabsList>
            {accountabilityAccess && (
              <TabsTrigger value="accountability">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Accountability
              </TabsTrigger>
            )}
            {trainingObjectivesAccess !== "none" && (
              <TabsTrigger value="trainingObjectives">
                <GraduationCap className="h-3.5 w-3.5" />
                Training Objectives
              </TabsTrigger>
            )}
            {memoReviewAccess && (
              <TabsTrigger value="memorandums">
                <FileText className="h-3.5 w-3.5" />
                Memorandums
              </TabsTrigger>
            )}
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
              <Skeleton className="h-64 w-full" />
            </div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-destructive">{loadError}</span>
            </div>
          ) : (
            <>
              {accountabilityAccess && (
                <TabsContent value="accountability">
                  <AnimatedPanel>
                    <AccountabilityAnalyticsView
                      roster={scopedCadets}
                      events={eventsState.events}
                      attendance={attendanceState.attendance}
                      absenceMemos={absenceState.memos}
                      unitScope={unitScope}
                    />
                  </AnimatedPanel>
                </TabsContent>
              )}
              {trainingObjectivesAccess !== "none" && (
                <TabsContent value="trainingObjectives">
                  <AnimatedPanel>
                    <TrainingObjectivesAnalyticsView
                      cadets={toCadets}
                      catalog={catalogState.catalog}
                      completions={completionsState.completions}
                      pmtEvents={eventsState.events}
                      availableDevLevels={availableDevLevels}
                    />
                  </AnimatedPanel>
                </TabsContent>
              )}
              {memoReviewAccess && (
                <TabsContent value="memorandums">
                  <AnimatedPanel>
                    <MemorandumsAnalyticsView
                      roster={memoRoster}
                      events={eventsState.events}
                      attendance={attendanceState.attendance}
                      absenceMemos={absenceState.memos}
                      deviationMemos={deviationState.memos}
                      showAbsence={memoReviewAbsenceAccess}
                      updateAbsenceMemo={absenceState.updateMemo}
                      updateDeviationMemo={deviationState.updateMemo}
                    />
                  </AnimatedPanel>
                </TabsContent>
              )}
            </>
          )}
        </main>
      </Tabs>
    </div>
  );
}
