import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCadets } from "../hooks/useCadets";
import { usePmtEvents } from "../hooks/usePmtEvents";
import { useAttendance } from "../hooks/useAttendance";
import { useAbsenceMemos } from "../hooks/useAbsenceMemos";
import { useDeviationMemos } from "../hooks/useDeviationMemos";
import { SelfServiceDashboardScreen } from "../screens/selfServiceDashboard/SelfServiceDashboardScreen";

interface Props {
  userEmail: string | null | undefined;
}

/** Same as GmcDashboardApp, for every POC cadet -- peers are grouped by Group instead of Flight, since POC has no Flight field. */
export function PocDashboardApp({ userEmail }: Props) {
  const cadetsState = useCadets();
  const eventsState = usePmtEvents();
  const attendanceState = useAttendance();
  const absenceState = useAbsenceMemos();
  const deviationState = useDeviationMemos();

  const dataLoading = cadetsState.loading || eventsState.loading || attendanceState.loading || absenceState.loading || deviationState.loading;
  const loadError = cadetsState.error || eventsState.error || attendanceState.error || absenceState.error || deviationState.error;

  const normalized = userEmail?.trim().toLowerCase();
  const me = cadetsState.cadets.find((p) => p.email?.trim().toLowerCase() === normalized);
  const peers = useMemo(
    () => cadetsState.cadets.filter((p) => p.status === "Active" && !p.isCadre && p.group === me?.group),
    [cadetsState.cadets, me?.group]
  );

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
  if (!me) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        We couldn't find a cadet record matching your login email ({userEmail}). Contact cadre to make sure your roster email matches.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-6">
      <SelfServiceDashboardScreen
        cadet={me}
        peers={peers}
        peerLabel="Group combined %"
        events={eventsState.events}
        attendance={attendanceState.attendance}
        absenceMemos={absenceState.memos}
        deviationMemos={deviationState.memos}
      />
    </div>
  );
}
