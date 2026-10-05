import { useMemo } from "react";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useTrainingObjectives } from "../hooks/useTrainingObjectives";
import { useAutoFailCompletions } from "../hooks/useAutoFailCompletions";
import { useAbsenceMemoAssignments } from "../hooks/useAbsenceMemoAssignments";
import { applyUnitScope, excludeCadre, excludeInactive, type UnitScope } from "../domain/access";
import { AttendanceScreen } from "../screens/accountability/AttendanceScreen";

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="h-full">
      {children}
    </motion.div>
  );
}

interface Props {
  /** Group/Flight Commanders only ever see their own unit's cadets, everywhere in this sub-app (Section 5). */
  unitScope: UnitScope;
}

/**
 * PT/LLAB/FM accountability -- goes straight to the attendance-taking screen, no more Dashboard
 * sub-tab (deleted: its "Active roster"/standing counts and Missed Accountability list now live in
 * the Cadre Dashboard and SAE Review, which cover the same ground detachment-wide instead of per
 * unit-scoped viewer). Roster/Events moved to Settings (Section 6).
 */
export function AccountabilityApp({ unitScope }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const attendanceState = useAttendance();
  const catalogState = useTrainingObjectives();
  const { applyAbsenceNotPass } = useAutoFailCompletions();
  const absenceMemoAssignmentsState = useAbsenceMemoAssignments();

  // Cadre supervise, they're never a tracked subject (Section 4) -- excluded right alongside unit scoping.
  // An Inactive cadet is no longer tracked here either.
  const scopedCadets = useMemo(
    () => excludeInactive(excludeCadre(applyUnitScope(unitScope, cadetsState.cadets))),
    [unitScope, cadetsState.cadets]
  );

  const dataLoading = cadetsState.loading || eventsState.loading || attendanceState.loading || catalogState.loading || absenceMemoAssignmentsState.loading;
  const loadError = cadetsState.error || eventsState.error || attendanceState.error || catalogState.error || absenceMemoAssignmentsState.error;

  return (
    <div className="flex h-full flex-col overflow-auto p-3 sm:p-6">
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
        <AnimatedPanel>
          <AttendanceScreen
            roster={scopedCadets}
            events={eventsState.events}
            attendance={attendanceState.attendance}
            createAttendance={attendanceState.createAttendance}
            updateAttendance={attendanceState.updateAttendance}
            deleteAttendance={attendanceState.deleteAttendance}
            refetchAttendance={attendanceState.refetch}
            catalog={catalogState.catalog}
            applyAbsenceNotPass={applyAbsenceNotPass}
            assignAbsenceMemo={absenceMemoAssignmentsState.assignAbsenceMemo}
            retractAbsenceMemoAssignment={absenceMemoAssignmentsState.retractAssignment}
            linkPreSubmittedAttendance={absenceMemoAssignmentsState.linkPreSubmittedAttendance}
            discardOrphanedPreSubmission={absenceMemoAssignmentsState.discardOrphanedPreSubmission}
            refetchAbsenceMemoAssignments={absenceMemoAssignmentsState.refetch}
            unitScope={unitScope}
          />
        </AnimatedPanel>
      )}
    </div>
  );
}
