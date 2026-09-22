import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ClipboardList } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { SubmitAbsenceMemoScreen } from "../screens/memoSubmission/SubmitAbsenceMemoScreen";
import { SubmitDeviationMemoScreen } from "../screens/memoSubmission/SubmitDeviationMemoScreen";

type Screen = "absence" | "deviation";

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
}

/** GMC/POC-facing submission -- Absence Memo, Deviation Memo. A signed-in cadet only ever sees their own submissions. */
export function MemoSubmissionApp({ userEmail }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();

  const [screen, setScreen] = useState<Screen>("absence");

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
        <nav className="px-8 pt-2">
          <TabsList>
            <TabsTrigger value="absence">
              <FileText className="h-3.5 w-3.5" />
              Absence Memo
            </TabsTrigger>
            <TabsTrigger value="deviation">
              <ClipboardList className="h-3.5 w-3.5" />
              Deviation Memo
            </TabsTrigger>
          </TabsList>
        </nav>

        <main className="flex-1 overflow-auto p-6">
          {dataLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-destructive">{loadError}</span>
            </div>
          ) : !myCadet ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-destructive">
                We couldn't find a cadet record matching your login email ({userEmail}). Contact cadre to make sure your roster email matches.
              </p>
            </div>
          ) : (
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
          )}
        </main>
      </Tabs>
    </div>
  );
}
