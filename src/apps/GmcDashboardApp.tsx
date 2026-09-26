import { Skeleton } from "@/components/ui/skeleton";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { GmcDashboardScreen } from "../screens/gmcDashboard/GmcDashboardScreen";

interface Props {
  userEmail: string | null | undefined;
}

/** Section 13 -- every GMC cadet's own tab, scoped to just themselves via email lookup (same pattern Memo Submission already uses). */
export function GmcDashboardApp({ userEmail }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const attendanceState = useAttendance();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();

  const dataLoading = cadetsState.loading || eventsState.loading || attendanceState.loading || absenceState.loading || deviationState.loading;
  const loadError = cadetsState.error || eventsState.error || attendanceState.error || absenceState.error || deviationState.error;

  if (dataLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-destructive">{loadError}</span>
      </div>
    );
  }

  const normalized = userEmail?.trim().toLowerCase();
  const me = cadetsState.cadets.find((p) => p.email?.trim().toLowerCase() === normalized);
  if (!me) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        We couldn't find a cadet record matching your login email ({userEmail}). Contact cadre to make sure your roster email matches.
      </div>
    );
  }

  return (
    <div className="overflow-auto p-6">
      <GmcDashboardScreen
        cadet={me}
        roster={cadetsState.cadets}
        events={eventsState.events}
        attendance={attendanceState.attendance}
        absenceMemos={absenceState.memos}
        deviationMemos={deviationState.memos}
      />
    </div>
  );
}
