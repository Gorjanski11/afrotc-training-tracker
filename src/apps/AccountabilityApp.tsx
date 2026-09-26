import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, LayoutDashboard } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useTrainingObjectives } from "../hooks/useTrainingObjectives";
import { useAutoFailCompletions } from "../hooks/useAutoFailCompletions";
import { useAbsenceMemoAssignments } from "../hooks/useAbsenceMemoAssignments";
import { applyUnitScope, excludeCadre, type UnitScope } from "../domain/access";
import { DashboardScreen } from "../screens/accountability/DashboardScreen";
import { AttendanceScreen } from "../screens/accountability/AttendanceScreen";

type Screen = "dashboard" | "attendance";

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

interface Props {
  /** Group/Flight Commanders only ever see their own unit's cadets, everywhere in this sub-app (Section 5). */
  unitScope: UnitScope;
}

/** PT/LLAB/FM accountability -- Dashboard, Accountability entry. Roster/Events moved to Settings (Section 6). */
export function AccountabilityApp({ unitScope }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const attendanceState = useAttendance();
  const catalogState = useTrainingObjectives();
  const { applyAbsenceNotPass } = useAutoFailCompletions();
  const absenceMemoAssignmentsState = useAbsenceMemoAssignments();

  // Cadre supervise, they're never a tracked subject (Section 4) -- excluded right alongside unit scoping.
  const scopedCadets = useMemo(() => excludeCadre(applyUnitScope(unitScope, cadetsState.cadets)), [unitScope, cadetsState.cadets]);

  const [screen, setScreen] = useState<Screen>("dashboard");
  // Dashboard's "Missed Accountability" card jumps straight to a specific PMT in the Accountability
  // (attendance-taking) screen -- this is that target, threaded down as AttendanceScreen's initial selection.
  const [targetPmtEventId, setTargetPmtEventId] = useState<string | undefined>();
  const navigateToPmt = (pmtEventId: string) => {
    setTargetPmtEventId(pmtEventId);
    setScreen("attendance");
  };

  const dataLoading = cadetsState.loading || eventsState.loading || attendanceState.loading || catalogState.loading || absenceMemoAssignmentsState.loading;
  const loadError = cadetsState.error || eventsState.error || attendanceState.error || catalogState.error || absenceMemoAssignmentsState.error;

  return (
    <div className="flex h-full flex-col">
      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-8 pt-2">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="attendance">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Accountability
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
                    roster={scopedCadets}
                    events={eventsState.events}
                    attendance={attendanceState.attendance}
                    onNavigateToPmt={navigateToPmt}
                  />
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="attendance">
                <AnimatedPanel>
                  <AttendanceScreen
                    roster={scopedCadets}
                    events={eventsState.events}
                    attendance={attendanceState.attendance}
                    createAttendance={attendanceState.createAttendance}
                    updateAttendance={attendanceState.updateAttendance}
                    catalog={catalogState.catalog}
                    applyAbsenceNotPass={applyAbsenceNotPass}
                    assignAbsenceMemo={absenceMemoAssignmentsState.assignAbsenceMemo}
                    retractAbsenceMemoAssignment={absenceMemoAssignmentsState.retractAssignment}
                    linkPreSubmittedAttendance={absenceMemoAssignmentsState.linkPreSubmittedAttendance}
                    initialPmtEventId={targetPmtEventId}
                    unitScope={unitScope}
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
