import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ClipboardList, LibraryBig } from "lucide-react";
import { EdgeSidebar } from "@/components/mobile/EdgeSidebar";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { SubmitAbsenceMemoScreen } from "../screens/memoSubmission/SubmitAbsenceMemoScreen";
import { SubmitDeviationMemoScreen } from "../screens/memoSubmission/SubmitDeviationMemoScreen";
import { MemorandumTemplatesScreen } from "../screens/memoSubmission/MemorandumTemplatesScreen";

type Screen = "absence" | "deviation" | "templates";

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

interface Props {
  /** The hub's signed-in user email -- identity comes from matching this against the roster, not from picking a name off a list. Visible to literally everyone signed in, no access restriction. */
  userEmail: string | null | undefined;
  /** Set by My Dashboard's "Missing Memos" tile -- jumps straight to the Absence or Deviation sub-screen on mount, then `onConsumeInitialScreen` clears it so it doesn't re-fire on a later remount. */
  initialScreen?: "absence" | "deviation";
  onConsumeInitialScreen?: () => void;
}

/** GMC/POC-facing submission -- Absence Memo, Deviation Memo. A signed-in cadet only ever sees their own submissions. */
export function MemoSubmissionApp({ userEmail, initialScreen, onConsumeInitialScreen }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();

  const [screen, setScreen] = useState<Screen>("absence");

  useEffect(() => {
    if (!initialScreen) return;
    setScreen(initialScreen);
    onConsumeInitialScreen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreen]);

  const dataLoading = cadetsState.loading || eventsState.loading || absenceState.loading || deviationState.loading;
  const loadError = cadetsState.error || eventsState.error || absenceState.error || deviationState.error;

  const myCadet = useMemo(() => {
    if (!userEmail) return undefined;
    const normalized = userEmail.trim().toLowerCase();
    return cadetsState.cadets.find((p) => p.email?.trim().toLowerCase() === normalized);
  }, [userEmail, cadetsState.cadets]);

  return (
    <div className="flex h-full flex-col">
      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="hidden desktop:block desktop:px-8 desktop:pt-2">
          <TabsList>
            <TabsTrigger value="absence">
              <FileText className="h-3.5 w-3.5" />
              <span>Absence Memo</span>
            </TabsTrigger>
            <TabsTrigger value="deviation">
              <ClipboardList className="h-3.5 w-3.5" />
              <span>Deviation Memo</span>
            </TabsTrigger>
            <TabsTrigger value="templates">
              <LibraryBig className="h-3.5 w-3.5" />
              <span>Memorandum Templates</span>
            </TabsTrigger>
          </TabsList>
        </nav>

        <EdgeSidebar
          title="Memo Submission"
          active={screen}
          onChange={(v) => setScreen(v)}
          items={[
            { value: "absence", label: "Absence Memo", icon: FileText },
            { value: "deviation", label: "Deviation Memo", icon: ClipboardList },
            { value: "templates", label: "Memorandum Templates", icon: LibraryBig },
          ]}
        />

        <main className="flex-1 overflow-auto p-3 sm:p-6">
          {dataLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-destructive">{loadError}</span>
            </div>
          ) : (
            <>
              {myCadet ? (
                <>
                  <TabsContent value="absence">
                    <AnimatedPanel>
                      <SubmitAbsenceMemoScreen
                        cadet={myCadet}
                        events={eventsState.events}
                        memos={absenceState.memos}
                        createMemo={absenceState.createMemo}
                        updateMemo={absenceState.updateMemo}
                        deleteMemo={absenceState.deleteMemo}
                      />
                    </AnimatedPanel>
                  </TabsContent>
                  <TabsContent value="deviation">
                    <AnimatedPanel>
                      <SubmitDeviationMemoScreen cadet={myCadet} memos={deviationState.memos} updateMemo={deviationState.updateMemo} />
                    </AnimatedPanel>
                  </TabsContent>
                </>
              ) : (
                (screen === "absence" || screen === "deviation") && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <p className="text-sm text-destructive">
                      We couldn't find a cadet record matching your login email ({userEmail}). Contact cadre to make sure your roster email matches.
                    </p>
                  </div>
                )
              )}
              {/* Reference templates need no cadet match -- visible to literally everyone with Memo Submission access. */}
              <TabsContent value="templates">
                <AnimatedPanel>
                  <MemorandumTemplatesScreen />
                </AnimatedPanel>
              </TabsContent>
            </>
          )}
        </main>
      </Tabs>
    </div>
  );
}
