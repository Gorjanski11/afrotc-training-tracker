import { motion } from "motion/react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldHalf, LogOut, KeyRound, GraduationCap, ClipboardCheck, FileText, Send, BarChart2 } from "lucide-react";
import { useCadets } from "./hooks/useCadets";
import { useAuth } from "./hooks/useAuth";
import { resolveTabAccess } from "./domain/access";
import { SignInScreen } from "./components/SignInScreen";
import { ChangePasswordDialog } from "./components/ChangePasswordDialog";
import { TrainingObjectivesApp } from "./apps/TrainingObjectivesApp";
import { AccountabilityApp } from "./apps/AccountabilityApp";
import { MemoReviewApp } from "./apps/MemoReviewApp";
import { MemoSubmissionApp } from "./apps/MemoSubmissionApp";
import { AnalyticsApp } from "./apps/AnalyticsApp";

type HubTab = "trainingObjectives" | "accountability" | "memoReview" | "analytics" | "memoSubmission";

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }} className="h-full">
      {children}
    </motion.div>
  );
}

/**
 * Unified hub -- everyone with an account signs into the same site; which top-level tabs show
 * (and, within Memo Review, whether Absence Memos also shows) is decided per-person by
 * domain/access.ts, not by which URL they visited. Consolidates what used to be 4 separately-
 * deployed sites (afrotc-training-tracker, afrotc-accountability-tracker,
 * afrotc-memorandums-tracker, afrotc-memo-submissions) sharing one Firebase project -- each is now
 * a sub-app under src/apps/ instead of its own repo/deploy.
 */
function App() {
  const { user, authLoading, signIn, signOut, changePassword } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const cadetsState = useCadets();

  const tabAccess = resolveTabAccess(user?.email, cadetsState.cadets);
  const hasAnalyticsAccess = tabAccess.accountability || tabAccess.trainingObjectives !== "none" || tabAccess.memoReview;
  const visibleTabs: HubTab[] = [
    ...(tabAccess.trainingObjectives !== "none" ? (["trainingObjectives"] as const) : []),
    ...(tabAccess.accountability ? (["accountability"] as const) : []),
    ...(tabAccess.memoReview ? (["memoReview"] as const) : []),
    ...(hasAnalyticsAccess ? (["analytics"] as const) : []),
    "memoSubmission",
  ];
  const [tab, setTab] = useState<HubTab>(visibleTabs[0]);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];

  if (authLoading || cadetsState.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) {
    return <SignInScreen signIn={signIn} />;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-input bg-background px-8 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldHalf className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-semibold">Borinkeneers Det 756</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button variant="ghost" size="icon" onClick={() => setChangePasswordOpen(true)} aria-label="Change password">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} changePassword={changePassword} />

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as HubTab)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-8 pt-2">
          <TabsList>
            {tabAccess.trainingObjectives !== "none" && (
              <TabsTrigger value="trainingObjectives">
                <GraduationCap className="h-3.5 w-3.5" />
                TO's
              </TabsTrigger>
            )}
            {tabAccess.accountability && (
              <TabsTrigger value="accountability">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Accountability
              </TabsTrigger>
            )}
            {tabAccess.memoReview && (
              <TabsTrigger value="memoReview">
                <FileText className="h-3.5 w-3.5" />
                Memo Review
              </TabsTrigger>
            )}
            {hasAnalyticsAccess && (
              <TabsTrigger value="analytics">
                <BarChart2 className="h-3.5 w-3.5" />
                Analytics
              </TabsTrigger>
            )}
            <TabsTrigger value="memoSubmission">
              <Send className="h-3.5 w-3.5" />
              Memo Submission
            </TabsTrigger>
          </TabsList>
        </nav>

        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === "trainingObjectives" && tabAccess.trainingObjectives !== "none" && (
              <TabsContent value="trainingObjectives" className="h-full" forceMount>
                <AnimatedPanel>
                  <TrainingObjectivesApp key="trainingObjectives" cohortAccess={tabAccess.trainingObjectives} unitScope={tabAccess.unitScope} />
                </AnimatedPanel>
              </TabsContent>
            )}
            {activeTab === "accountability" && tabAccess.accountability && (
              <TabsContent value="accountability" className="h-full" forceMount>
                <AnimatedPanel>
                  <AccountabilityApp key="accountability" unitScope={tabAccess.unitScope} />
                </AnimatedPanel>
              </TabsContent>
            )}
            {activeTab === "memoReview" && tabAccess.memoReview && (
              <TabsContent value="memoReview" className="h-full" forceMount>
                <AnimatedPanel>
                  <MemoReviewApp key="memoReview" showAbsence={tabAccess.memoReviewAbsence} userEmail={user.email} />
                </AnimatedPanel>
              </TabsContent>
            )}
            {activeTab === "analytics" && hasAnalyticsAccess && (
              <TabsContent value="analytics" className="h-full" forceMount>
                <AnimatedPanel>
                  <AnalyticsApp
                    key="analytics"
                    accountabilityAccess={tabAccess.accountability}
                    trainingObjectivesAccess={tabAccess.trainingObjectives}
                    memoReviewAccess={tabAccess.memoReview}
                    memoReviewAbsenceAccess={tabAccess.memoReviewAbsence}
                    unitScope={tabAccess.unitScope}
                  />
                </AnimatedPanel>
              </TabsContent>
            )}
            {activeTab === "memoSubmission" && (
              <TabsContent value="memoSubmission" className="h-full" forceMount>
                <AnimatedPanel>
                  <MemoSubmissionApp key="memoSubmission" userEmail={user.email} />
                </AnimatedPanel>
              </TabsContent>
            )}
          </AnimatePresence>
        </main>
      </Tabs>
    </div>
  );
}

export default App;
