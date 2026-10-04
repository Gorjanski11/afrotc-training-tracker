import { Skeleton } from "@/components/ui/skeleton";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { CadreDashboardScreen } from "../screens/CadreDashboardScreen";
import type { DashboardNavIntent } from "../domain/dashboardNav";

interface Props {
  userEmail: string | null | undefined;
  navigateTo: (tab: "memoReview" | "analytics", intent: DashboardNavIntent) => void;
}

/** Section 7 -- true Cadre's landing dashboard (My Dashboard tab). */
export function CadreDashboardApp({ userEmail, navigateTo }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const attendanceState = useAttendance();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();

  const dataLoading = cadetsState.loading || eventsState.loading || attendanceState.loading || absenceState.loading || deviationState.loading;
  const loadError = cadetsState.error || eventsState.error || attendanceState.error || absenceState.error || deviationState.error;

  if (dataLoading) {
    return (
      <div className="space-y-4 p-3 sm:p-6">
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

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6">
      <CadreDashboardScreen
        roster={cadetsState.cadets}
        events={eventsState.events}
        attendance={attendanceState.attendance}
        absenceMemos={absenceState.memos}
        deviationMemos={deviationState.memos}
        userEmail={userEmail}
        navigateTo={navigateTo}
      />
    </div>
  );
}
