import { motion } from "motion/react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  LogOut,
  KeyRound,
  GraduationCap,
  ClipboardCheck,
  FileText,
  Send,
  BarChart2,
  Settings,
  LayoutDashboard,
  Monitor,
  Smartphone,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCadets } from "./hooks/useCadets";
import { useAuth } from "./hooks/useAuth";
import { useViewMode } from "./hooks/useViewMode";
import { resolveTabAccess } from "./domain/access";
import { SignInScreen } from "./components/SignInScreen";
import { ChangePasswordDialog } from "./components/ChangePasswordDialog";
import { TrainingObjectivesApp } from "./apps/TrainingObjectivesApp";
import { AccountabilityApp } from "./apps/AccountabilityApp";
import { MemoReviewApp } from "./apps/MemoReviewApp";
import { MemoSubmissionApp } from "./apps/MemoSubmissionApp";
import { AnalyticsApp } from "./apps/AnalyticsApp";
import { SettingsApp } from "./apps/SettingsApp";
import { GmcDashboardApp } from "./apps/GmcDashboardApp";
import { PocDashboardApp } from "./apps/PocDashboardApp";

type HubTab = "accountability" | "trainingObjectives" | "memoSubmission" | "myDashboard" | "memoReview" | "analytics" | "settings";

/** Label + icon per tab, shared by the desktop TabsList and the phone dropdown (Section H) so the two never drift apart. */
const TAB_META: Record<HubTab, { label: string; icon: typeof LayoutDashboard }> = {
  myDashboard: { label: "My Dashboard", icon: LayoutDashboard },
  accountability: { label: "Accountability", icon: ClipboardCheck },
  trainingObjectives: { label: "TO's", icon: GraduationCap },
  memoSubmission: { label: "Memo Submission", icon: Send },
  memoReview: { label: "Memo Review", icon: FileText },
  analytics: { label: "Analytics", icon: BarChart2 },
  settings: { label: "Settings", icon: Settings },
};

/**
 * Every new account is created by an admin with this same shared password (go-around for Firebase
 * having no native "must change password on first login" flag). Signing in with it exactly always
 * forces the Change Password dialog; the more durable `Cadet.mustChangePassword` flag (set on
 * creation and on any admin-driven reset, cleared on a successful self-service change) also forces
 * it even when an admin reset someone to a different one-off password instead of this shared one.
 */
const SHARED_TEMP_PASSWORD = "det756";

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
  const [forcedPasswordChange, setForcedPasswordChange] = useState(false);
  const [pendingCurrentPassword, setPendingCurrentPassword] = useState<string | undefined>();
  const cadetsState = useCadets();
  const { mode: viewMode, toggle: toggleViewMode } = useViewMode();

  const handleSignIn = async (email: string, password: string) => {
    await signIn(email, password);
    const normalized = email.trim().toLowerCase();
    const me = cadetsState.cadets.find((p) => p.email?.trim().toLowerCase() === normalized);
    // Either signal forces it: the literal shared password (covers anyone not yet backfilled with
    // the flag), or mustChangePassword itself (survives an admin resetting them to some OTHER
    // password too, e.g. a forgotten-password recovery reset from Account Manager). Either way,
    // prefill with whatever password was just typed -- it's guaranteed correct since sign-in succeeded.
    if (password === SHARED_TEMP_PASSWORD || me?.mustChangePassword === true) {
      setPendingCurrentPassword(password);
      setForcedPasswordChange(true);
      setChangePasswordOpen(true);
    }
  };

  const handleChangePasswordClose = () => {
    setChangePasswordOpen(false);
    setForcedPasswordChange(false);
    setPendingCurrentPassword(undefined);
  };

  /** Clears mustChangePassword the moment the signed-in person successfully sets their OWN password -- only an admin setting it on their behalf (CadetFormDialog/AccountManagerScreen) ever sets it back to true. */
  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    await changePassword(currentPassword, newPassword);
    const normalized = user?.email?.trim().toLowerCase();
    const me = cadetsState.cadets.find((p) => p.email?.trim().toLowerCase() === normalized);
    if (me?.mustChangePassword) {
      await cadetsState.updateCadetFields(me.id, { mustChangePassword: false });
    }
  };

  const tabAccess = resolveTabAccess(user?.email, cadetsState.cadets);
  const hasAnalyticsAccess = tabAccess.accountability || tabAccess.trainingObjectives !== "none" || tabAccess.memoReview;
  const hasSettingsAccess = tabAccess.accountability || tabAccess.trainingObjectives !== "none";
  const visibleTabs: HubTab[] = [
    ...(tabAccess.gmcDashboard || tabAccess.pocDashboard ? (["myDashboard"] as const) : []),
    ...(tabAccess.accountability ? (["accountability"] as const) : []),
    ...(tabAccess.trainingObjectives !== "none" ? (["trainingObjectives"] as const) : []),
    "memoSubmission",
    ...(tabAccess.memoReview ? (["memoReview"] as const) : []),
    ...(hasAnalyticsAccess ? (["analytics"] as const) : []),
    ...(hasSettingsAccess ? (["settings"] as const) : []),
  ];
  const [tab, setTab] = useState<HubTab>(visibleTabs[0]);
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0];
  const [phoneNavOpen, setPhoneNavOpen] = useState(false);

  if (authLoading || cadetsState.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!user) {
    return <SignInScreen signIn={handleSignIn} />;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-input bg-background px-3 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img src={`${import.meta.env.BASE_URL}det756-logo.webp`} alt="AFROTC Det 756" className="h-8 w-8 shrink-0 rounded-full object-cover sm:h-9 sm:w-9" />
          <h1 className="truncate text-base font-semibold sm:text-xl">Borinkeneers Det 756</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <span className="hidden truncate text-sm text-muted-foreground md:inline">{user.email}</span>
          <Button variant="ghost" size="icon" onClick={toggleViewMode} aria-label={viewMode === "desktop" ? "Switch to mobile view" : "Switch to desktop view"}>
            {viewMode === "desktop" ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setChangePasswordOpen(true)} aria-label="Change password">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={handleChangePasswordClose}
        changePassword={handleChangePassword}
        initialCurrentPassword={forcedPasswordChange ? pendingCurrentPassword : undefined}
        forced={forcedPasswordChange}
      />

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as HubTab)} className="flex flex-1 flex-col overflow-hidden">
        <nav className="px-3 pt-2 sm:px-8">
          {/* sm+: the usual horizontal tab strip. Below sm: a single dropdown button instead (Section H) -- easier to tap than a scrolling row of icon-only tabs. */}
          <TabsList className="hidden sm:flex">
            {visibleTabs.map((t) => {
              const { label, icon: Icon } = TAB_META[t];
              return (
                <TabsTrigger key={t} value={t}>
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <Popover open={phoneNavOpen} onOpenChange={setPhoneNavOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex w-full items-center justify-between gap-2 sm:hidden">
                <span className="flex items-center gap-2">
                  {(() => {
                    const Icon = TAB_META[activeTab].icon;
                    return <Icon className="h-4 w-4" />;
                  })()}
                  {TAB_META[activeTab].label}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[calc(100vw-1.5rem)] p-1">
              <div className="flex flex-col">
                {visibleTabs.map((t) => {
                  const { label, icon: Icon } = TAB_META[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      className={cn(
                        "flex items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm hover:bg-accent",
                        t === activeTab && "bg-accent font-medium"
                      )}
                      onClick={() => {
                        setTab(t);
                        setPhoneNavOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </nav>

        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === "accountability" && tabAccess.accountability && (
              <TabsContent value="accountability" className="h-full" forceMount>
                <AnimatedPanel>
                  <AccountabilityApp key="accountability" unitScope={tabAccess.unitScope} />
                </AnimatedPanel>
              </TabsContent>
            )}
            {activeTab === "trainingObjectives" && tabAccess.trainingObjectives !== "none" && (
              <TabsContent value="trainingObjectives" className="h-full" forceMount>
                <AnimatedPanel>
                  <TrainingObjectivesApp key="trainingObjectives" cohortAccess={tabAccess.trainingObjectives} unitScope={tabAccess.unitScope} userEmail={user.email} />
                </AnimatedPanel>
              </TabsContent>
            )}
            {activeTab === "myDashboard" && (tabAccess.gmcDashboard || tabAccess.pocDashboard) && (
              <TabsContent value="myDashboard" className="h-full" forceMount>
                <AnimatedPanel>
                  {tabAccess.gmcDashboard ? (
                    <GmcDashboardApp key="gmcDashboard" userEmail={user.email} />
                  ) : (
                    <PocDashboardApp key="pocDashboard" userEmail={user.email} />
                  )}
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
            {activeTab === "settings" && hasSettingsAccess && (
              <TabsContent value="settings" className="h-full" forceMount>
                <AnimatedPanel>
                  <SettingsApp key="settings" userEmail={user.email} />
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
