import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { UserCog, Users, CalendarDays, Link2, Mail, Database, CalendarPlus, ShieldAlert } from "lucide-react";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useExtraEvents } from "../hooks/useExtraEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useTrainingObjectives } from "../hooks/useTrainingObjectives";
import { useCompletions } from "../hooks/useCompletions";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { useEmailTemplates } from "../hooks/useEmailTemplates";
import { useAuth } from "../hooks/useAuth";
import { isFullAccess, isCadreOrCortesGaray, isCortesGaray, canManageAccounts, canEditEvents, resolveTabAccess } from "../domain/access";
import { AccountManagerScreen } from "../screens/settings/AccountManagerScreen";
import { RosterScreen } from "../screens/settings/RosterScreen";
import { EventsScreen } from "../screens/settings/EventsScreen";
import { QuickLinksScreen } from "../screens/settings/QuickLinksScreen";
import { MemorandumTemplatesScreen } from "../screens/settings/MemorandumTemplatesScreen";
import { DataManagementScreen } from "../screens/settings/DataManagementScreen";
import { NewSemesterScreen } from "../screens/settings/NewSemesterScreen";
import { SaeReviewScreen } from "../screens/settings/SaeReviewScreen";

type Section = "accounts" | "roster" | "events" | "links" | "templates" | "data" | "newSemester" | "saeReview";

interface Props {
  userEmail: string | null | undefined;
  /** Set by the SAE's My Dashboard "Open full SAE Review" link -- jumps to that section on mount, then `onConsumeInitialSection` clears it. */
  initialSection?: Section;
  onConsumeInitialSection?: () => void;
}

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

/** Section 6 -- the new Settings mega-tab. Unlike every other hub tab, its sub-sections live in a left-side vertical list instead of a top TabsList. */
export function SettingsApp({ userEmail, initialSection, onConsumeInitialSection }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const extraEventsState = useExtraEvents();
  const attendanceState = useAttendance();
  const catalogState = useTrainingObjectives();
  const completionsState = useCompletions();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();
  const emailTemplatesState = useEmailTemplates();
  const { reauthenticate, resetOtherPassword, impersonate, createCadetAccounts, disableCadetAccounts } = useAuth();

  const fullAccess = isFullAccess(userEmail, cadetsState.cadets);
  const accountManagerAccess = canManageAccounts(userEmail, cadetsState.cadets);
  const eventEditAccess = canEditEvents(userEmail, cadetsState.cadets);
  const unitScope = resolveTabAccess(userEmail, cadetsState.cadets).unitScope;
  const newSemesterAccess = isCadreOrCortesGaray(userEmail, cadetsState.cadets);
  // SOP (1 Oct 2026) Sections 3/4's review flags are literally "for review by the SAE" -- narrower
  // than Cadre, matching isCortesGaray (the same tier that gates New Semester's riskiest actions).
  const saeReviewAccess = isCortesGaray(userEmail);
  const [section, setSection] = useState<Section>("roster");

  useEffect(() => {
    if (!initialSection) return;
    setSection(initialSection);
    onConsumeInitialSection?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  const refetchAll = async () => {
    await Promise.all([
      cadetsState.refetch(),
      eventsState.refetch(),
      extraEventsState.refetch(),
      attendanceState.refetch(),
      completionsState.refetch(),
      absenceState.refetch(),
      deviationState.refetch(),
    ]);
  };

  const dataLoading =
    cadetsState.loading ||
    eventsState.loading ||
    extraEventsState.loading ||
    attendanceState.loading ||
    catalogState.loading ||
    completionsState.loading ||
    absenceState.loading ||
    deviationState.loading ||
    emailTemplatesState.loading;
  const loadError =
    cadetsState.error ||
    eventsState.error ||
    extraEventsState.error ||
    attendanceState.error ||
    catalogState.error ||
    completionsState.error ||
    absenceState.error ||
    deviationState.error ||
    emailTemplatesState.error;

  const navItems: { value: Section; label: string; icon: typeof UserCog }[] = [
    ...(accountManagerAccess ? [{ value: "accounts" as const, label: "Account Manager", icon: UserCog }] : []),
    { value: "roster", label: "Roster", icon: Users },
    { value: "events", label: "Events", icon: CalendarDays },
    ...(fullAccess ? [{ value: "links" as const, label: "Quick Links", icon: Link2 }] : []),
    ...(fullAccess ? [{ value: "templates" as const, label: "Auto-email Templates", icon: Mail }] : []),
    ...(fullAccess ? [{ value: "data" as const, label: "Data Management", icon: Database }] : []),
    ...(newSemesterAccess ? [{ value: "newSemester" as const, label: "New Semester", icon: CalendarPlus }] : []),
    ...(saeReviewAccess ? [{ value: "saeReview" as const, label: "SAE Review", icon: ShieldAlert }] : []),
  ];
  const activeSection = navItems.some((n) => n.value === section) ? section : navItems[0].value;

  return (
    <div className="flex h-full flex-col sm:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-input p-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-56 sm:flex-col sm:gap-0 sm:space-y-1 sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-4 [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => (
          <Button
            key={item.value}
            variant={activeSection === item.value ? "secondary" : "ghost"}
            className={cn("shrink-0 justify-start gap-2 sm:w-full")}
            onClick={() => setSection(item.value)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Button>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-3 sm:p-6">
        {dataLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : loadError ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-destructive">{loadError}</span>
          </div>
        ) : (
          <AnimatedPanel>
            {activeSection === "accounts" && accountManagerAccess && (
              <AccountManagerScreen
                roster={cadetsState.cadets}
                updateCadetFields={cadetsState.updateCadetFields}
                userEmail={userEmail}
                reauthenticate={reauthenticate}
                resetOtherPassword={resetOtherPassword}
                impersonate={impersonate}
              />
            )}
            {activeSection === "roster" && (
              <RosterScreen
                roster={cadetsState.cadets}
                events={eventsState.events}
                attendance={attendanceState.attendance}
                catalog={catalogState.catalog}
                completions={completionsState.completions}
                createCadet={cadetsState.createCadet}
                updateCadet={cadetsState.updateCadet}
                deleteCadet={async (id) => {
                  await completionsState.deleteCompletionsForCadet(id);
                  await cadetsState.deleteCadet(id);
                }}
                unitScope={unitScope}
              />
            )}
            {activeSection === "events" && (
              <EventsScreen
                events={eventsState.events}
                extraEvents={extraEventsState.extraEvents}
                catalog={catalogState.catalog}
                createEvent={eventsState.createEvent}
                updateEvent={eventsState.updateEvent}
                deleteEvent={eventsState.deleteEvent}
                createExtraEvent={extraEventsState.createExtraEvent}
                updateExtraEvent={extraEventsState.updateExtraEvent}
                deleteExtraEvent={extraEventsState.deleteExtraEvent}
                canEdit={eventEditAccess}
              />
            )}
            {activeSection === "links" && fullAccess && <QuickLinksScreen />}
            {activeSection === "templates" && fullAccess && (
              <MemorandumTemplatesScreen templates={emailTemplatesState.templates} saveTemplate={emailTemplatesState.saveTemplate} />
            )}
            {activeSection === "data" && fullAccess && (
              <DataManagementScreen
                roster={cadetsState.cadets}
                events={eventsState.events}
                attendance={attendanceState.attendance}
                catalog={catalogState.catalog}
                completions={completionsState.completions}
                absenceMemos={absenceState.memos}
                deviationMemos={deviationState.memos}
                userEmail={userEmail}
                reauthenticate={reauthenticate}
              />
            )}
            {activeSection === "newSemester" && newSemesterAccess && (
              <NewSemesterScreen
                roster={cadetsState.cadets}
                events={eventsState.events}
                attendance={attendanceState.attendance}
                catalog={catalogState.catalog}
                completions={completionsState.completions}
                absenceMemos={absenceState.memos}
                deviationMemos={deviationState.memos}
                userEmail={userEmail}
                reauthenticate={reauthenticate}
                createCadet={cadetsState.createCadet}
                updateCadet={cadetsState.updateCadet}
                updateCadetFields={cadetsState.updateCadetFields}
                deleteCadet={cadetsState.deleteCadet}
                createEvent={eventsState.createEvent}
                createCadetAccounts={createCadetAccounts}
                disableCadetAccounts={disableCadetAccounts}
                refetchAll={refetchAll}
              />
            )}
            {activeSection === "saeReview" && saeReviewAccess && (
              <SaeReviewScreen
                roster={cadetsState.cadets}
                events={eventsState.events}
                attendance={attendanceState.attendance}
                catalog={catalogState.catalog}
                completions={completionsState.completions}
              />
            )}
          </AnimatedPanel>
        )}
      </main>
    </div>
  );
}
