import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, LayoutDashboard, Users, CalendarDays } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useExtraEvents } from "../hooks/useExtraEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useTrainingObjectives } from "../hooks/useTrainingObjectives";
import { useAutoFailCompletions } from "../hooks/useAutoFailCompletions";
import { useAbsenceMemoAssignments } from "../hooks/useAbsenceMemoAssignments";
import { applyUnitScope, type UnitScope } from "../domain/access";
import { DashboardScreen } from "../screens/accountability/DashboardScreen";
import { RosterScreen } from "../screens/accountability/RosterScreen";
import { EventsScreen } from "../screens/accountability/EventsScreen";
import { AttendanceScreen } from "../screens/accountability/AttendanceScreen";

type Screen = "dashboard" | "roster" | "events" | "attendance";

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

/** PT/LLAB/FM accountability -- Dashboard, Roster, Events, Accountability entry, Analytics. */
export function AccountabilityApp({ unitScope }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const extraEventsState = useExtraEvents();
  const attendanceState = useAttendance();
  const catalogState = useTrainingObjectives();
  const { applyAbsenceNotPass } = useAutoFailCompletions();
  const absenceMemoAssignmentsState = useAbsenceMemoAssignments();

  const scopedCadets = useMemo(() => applyUnitScope(unitScope, cadetsState.cadets), [unitScope, cadetsState.cadets]);

  const [screen, setScreen] = useState<Screen>("dashboard");
  // Dashboard's "Accountability" card jumps straight to a specific PMT in the Accountability
  // (attendance-taking) screen -- this is that target, threaded down as AttendanceScreen's initial selection.
  const [targetPmtEventId, setTargetPmtEventId] = useState<string | undefined>();
  const navigateToPmt = (pmtEventId: string) => {
    setTargetPmtEventId(pmtEventId);
    setScreen("attendance");
  };

  const dataLoading =
    cadetsState.loading ||
    eventsState.loading ||
    extraEventsState.loading ||
    attendanceState.loading ||
    catalogState.loading ||
    absenceMemoAssignmentsState.loading;
  const loadError =
    cadetsState.error ||
    eventsState.error ||
    extraEventsState.error ||
    attendanceState.error ||
    catalogState.error ||
    absenceMemoAssignmentsState.error;

  return (
    <div className="flex h-full flex-col">
      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-8 pt-2">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="roster">
              <Users className="h-3.5 w-3.5" />
              Roster
            </TabsTrigger>
            <TabsTrigger value="events">
              <CalendarDays className="h-3.5 w-3.5" />
              Events
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
              <TabsContent value="roster">
                <AnimatedPanel>
                  <RosterScreen
                    roster={scopedCadets}
                    events={eventsState.events}
                    attendance={attendanceState.attendance}
                    updatePerson={cadetsState.updateCadetFields}
                  />
                </AnimatedPanel>
              </TabsContent>
              <TabsContent value="events">
                <AnimatedPanel>
                  <EventsScreen
                    events={eventsState.events}
                    extraEvents={extraEventsState.extraEvents}
                    createEvent={eventsState.createEvent}
                    updateEvent={eventsState.updateEvent}
                    deleteEvent={eventsState.deleteEvent}
                    createExtraEvent={extraEventsState.createExtraEvent}
                    updateExtraEvent={extraEventsState.updateExtraEvent}
                    deleteExtraEvent={extraEventsState.deleteExtraEvent}
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
