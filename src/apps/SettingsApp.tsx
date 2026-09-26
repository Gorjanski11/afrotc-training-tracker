import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { UserCog, Users, CalendarDays, Link2, Mail, Database, CalendarPlus } from "lucide-react";
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
import { isFullAccess } from "../domain/access";
import { AccountManagerScreen } from "../screens/settings/AccountManagerScreen";
import { RosterScreen } from "../screens/settings/RosterScreen";
import { EventsScreen } from "../screens/settings/EventsScreen";
import { QuickLinksScreen } from "../screens/settings/QuickLinksScreen";
import { MemorandumTemplatesScreen } from "../screens/settings/MemorandumTemplatesScreen";
import { DataManagementScreen } from "../screens/settings/DataManagementScreen";
import { NewSemesterScreen } from "../screens/settings/NewSemesterScreen";

type Section = "accounts" | "roster" | "events" | "links" | "templates" | "data" | "newSemester";

interface Props {
  userEmail: string | null | undefined;
}

function AnimatedPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

/** Section 6 -- the new Settings mega-tab. Unlike every other hub tab, its sub-sections live in a left-side vertical list instead of a top TabsList. */
export function SettingsApp({ userEmail }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const extraEventsState = useExtraEvents();
  const attendanceState = useAttendance();
  const catalogState = useTrainingObjectives();
  const completionsState = useCompletions();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();
  const emailTemplatesState = useEmailTemplates();
  const { reauthenticate } = useAuth();

  const fullAccess = isFullAccess(userEmail, cadetsState.cadets);
  const [section, setSection] = useState<Section>("roster");

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
    ...(fullAccess ? [{ value: "accounts" as const, label: "Account Manager", icon: UserCog }] : []),
    { value: "roster", label: "Roster", icon: Users },
    { value: "events", label: "Events", icon: CalendarDays },
    ...(fullAccess ? [{ value: "links" as const, label: "Quick Links", icon: Link2 }] : []),
    { value: "templates", label: "Memorandum Templates", icon: Mail },
    ...(fullAccess ? [{ value: "data" as const, label: "Data Management", icon: Database }] : []),
    { value: "newSemester", label: "New Semester", icon: CalendarPlus },
  ];
  const activeSection = navItems.some((n) => n.value === section) ? section : navItems[0].value;

  return (
    <div className="flex h-full">
      <nav className="w-56 shrink-0 space-y-1 overflow-y-auto border-r border-input p-4">
        {navItems.map((item) => (
          <Button
            key={item.value}
            variant={activeSection === item.value ? "secondary" : "ghost"}
            className={cn("w-full justify-start gap-2")}
            onClick={() => setSection(item.value)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Button>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-6">
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
            {activeSection === "accounts" && fullAccess && <AccountManagerScreen roster={cadetsState.cadets} updateCadetFields={cadetsState.updateCadetFields} />}
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
              />
            )}
            {activeSection === "events" && (
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
            )}
            {activeSection === "links" && fullAccess && <QuickLinksScreen />}
            {activeSection === "templates" && (
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
            {activeSection === "newSemester" && <NewSemesterScreen />}
          </AnimatedPanel>
        )}
      </main>
    </div>
  );
}
