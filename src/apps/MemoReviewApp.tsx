import { motion } from "motion/react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, LayoutDashboard, ClipboardList } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { useAttendanceLink } from "../hooks/useAttendanceLink";
import { useAttendanceRecords } from "../hooks/useAttendanceRecords";
import { DashboardScreen } from "../screens/memoReview/DashboardScreen";
import { AbsenceMemosScreen } from "../screens/memoReview/AbsenceMemosScreen";
import { DeviationMemosScreen } from "../screens/memoReview/DeviationMemosScreen";

type Screen = "dashboard" | "absence" | "deviation";

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

interface Props {
  /** Absence Memos tab/queue only shows for full-access users -- everyone else with Memo Review access sees Deviation Memos only. */
  showAbsence: boolean;
  userEmail: string | null | undefined;
}

/** Cadre review of Absence/Deviation memos -- Dashboard, Absence (full-access only), Deviation. Memorandum Templates and History moved to Settings (Section 6). */
export function MemoReviewApp({ showAbsence, userEmail }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();
  const attendanceLink = useAttendanceLink();
  const attendanceRecordsState = useAttendanceRecords();

  const [screen, setScreen] = useState<Screen>("dashboard");

  const dataLoading =
    cadetsState.loading || eventsState.loading || absenceState.loading || deviationState.loading || attendanceLink.loading || attendanceRecordsState.loading;
  const loadError =
    cadetsState.error || eventsState.error || absenceState.error || deviationState.error || attendanceLink.error || attendanceRecordsState.error;

  return (
    <div className="flex h-full flex-col">
      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-8 pt-2">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </TabsTrigger>
            {showAbsence && (
              <TabsTrigger value="absence">
                <FileText className="h-3.5 w-3.5" />
                Absence Memos
              </TabsTrigger>
            )}
            <TabsTrigger value="deviation">
              <ClipboardList className="h-3.5 w-3.5" />
              Deviation Memos
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
                    roster={cadetsState.cadets}
                    events={eventsState.events}
                    attendance={attendanceRecordsState.records}
                    absenceMemos={absenceState.memos}
                    deviationMemos={deviationState.memos}
                  />
                </AnimatedPanel>
              </TabsContent>
              {showAbsence && (
                <TabsContent value="absence">
                  <AnimatedPanel>
                    <AbsenceMemosScreen
                      events={eventsState.events}
                      memos={absenceState.memos}
                      updateMemo={absenceState.updateMemo}
                      applyMemoDecision={attendanceLink.applyMemoDecision}
                    />
                  </AnimatedPanel>
                </TabsContent>
              )}
              <TabsContent value="deviation">
                <AnimatedPanel>
                  <DeviationMemosScreen
                    roster={cadetsState.cadets}
                    memos={deviationState.memos}
                    createMemo={deviationState.createMemo}
                    updateMemo={deviationState.updateMemo}
                    userEmail={userEmail}
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
