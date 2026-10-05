import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, LayoutDashboard, ClipboardList } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { useAttendanceLink } from "../hooks/useAttendanceLink";
import { useAuth } from "../hooks/useAuth";
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
  /** Set by a Cadre/SAE Dashboard tile click (e.g. "Absence Memos pending review") -- jumps straight to that sub-screen on mount, then `onConsumeInitialScreen` clears it so it doesn't re-fire on a later remount. */
  initialScreen?: "absence" | "deviation";
  /** Set alongside `initialScreen` when the dashboard click was on a SPECIFIC memo row (not just the count tile) -- opens that memo's review popup immediately instead of just landing on the list. */
  initialOpenMemoId?: string;
  onConsumeInitialScreen?: () => void;
}

/** Cadre review of Absence/Deviation memos -- Dashboard, Absence (full-access only), Deviation. Memorandum Templates and History moved to Settings (Section 6). */
export function MemoReviewApp({ showAbsence, userEmail, initialScreen, initialOpenMemoId, onConsumeInitialScreen }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();
  const attendanceLink = useAttendanceLink();
  const { reauthenticate } = useAuth();

  const [screen, setScreen] = useState<Screen>("dashboard");
  // Which memo's review popup to auto-open the moment its screen mounts -- set either by the
  // top-level Dashboard/SAE Dashboard nav intent, or by clicking a row on this app's OWN Dashboard
  // sub-screen below. Cleared once AbsenceMemosScreen/DeviationMemosScreen has consumed it.
  const [openMemoId, setOpenMemoId] = useState<string | undefined>();

  useEffect(() => {
    if (!initialScreen) return;
    setScreen(initialScreen);
    if (initialOpenMemoId) setOpenMemoId(initialOpenMemoId);
    onConsumeInitialScreen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreen, initialOpenMemoId]);

  const openFromOwnDashboard = (target: "absence" | "deviation", memoId: string) => {
    setScreen(target);
    setOpenMemoId(memoId);
  };

  const dataLoading = cadetsState.loading || eventsState.loading || absenceState.loading || deviationState.loading || attendanceLink.loading;
  const loadError = cadetsState.error || eventsState.error || absenceState.error || deviationState.error || attendanceLink.error;

  return (
    <div className="flex h-full flex-col">
      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-3 pt-2 sm:px-8">
          <TabsList>
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            {showAbsence && (
              <TabsTrigger value="absence">
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Absence Memos</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="deviation">
              <ClipboardList className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Deviation Memos</span>
            </TabsTrigger>
          </TabsList>
        </nav>

        <main className="flex-1 overflow-auto p-3 sm:p-6">
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
                    events={eventsState.events}
                    absenceMemos={absenceState.memos}
                    deviationMemos={deviationState.memos}
                    roster={cadetsState.cadets}
                    userEmail={userEmail}
                    onOpenAbsence={showAbsence ? (memoId) => openFromOwnDashboard("absence", memoId) : undefined}
                  />
                </AnimatedPanel>
              </TabsContent>
              {showAbsence && (
                <TabsContent value="absence">
                  <AnimatedPanel>
                    <AbsenceMemosScreen
                      events={eventsState.events}
                      memos={absenceState.memos}
                      roster={cadetsState.cadets}
                      updateMemo={absenceState.updateMemo}
                      deleteMemo={absenceState.deleteMemo}
                      applyMemoDecision={attendanceLink.applyMemoDecision}
                      reauthenticate={reauthenticate}
                      userEmail={userEmail}
                      initialReviewId={screen === "absence" ? openMemoId : undefined}
                      onConsumeInitialReview={() => setOpenMemoId(undefined)}
                    />
                  </AnimatedPanel>
                </TabsContent>
              )}
              <TabsContent value="deviation">
                <AnimatedPanel>
                  <DeviationMemosScreen
                    roster={cadetsState.cadets}
                    memos={deviationState.memos}
                    events={eventsState.events}
                    createMemo={deviationState.createMemo}
                    updateMemo={deviationState.updateMemo}
                    deleteMemo={deviationState.deleteMemo}
                    reauthenticate={reauthenticate}
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
