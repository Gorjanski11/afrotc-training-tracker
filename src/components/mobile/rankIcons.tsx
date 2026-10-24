/**
 * C/3C (GMC rank: 2 chevrons) and C/Capt (POC rank: 2 bars) insignia, redrawn as small stroke-based
 * vector icons -- used in place of the generic ListChecks icon for GMC Log/POC Log (desktop TabsList
 * and the phone EdgeSidebar). Drawn in the same stroke/currentColor language as the lucide icons used
 * everywhere else (instead of a two-tone filled tile) so they correctly pick up whatever text color
 * the surrounding control applies -- active/inactive state in the sidebar's dark capsule, or plain
 * foreground on the desktop tab strip -- rather than being hardcoded to one theme's colors.
 */

function RankTile({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className} aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="1.5" />
      {children}
    </svg>
  );
}

export function C3CRankIcon({ className }: { className?: string }) {
  return (
    <RankTile className={className}>
      {[9, 15].map((y) => (
        <path key={y} d={`M5.5 ${y} L12 ${y - 3} L18.5 ${y}`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </RankTile>
  );
}

export function CCaptRankIcon({ className }: { className?: string }) {
  return (
    <RankTile className={className}>
      <line x1="5.5" y1="9" x2="18.5" y2="9" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="5.5" y1="15" x2="18.5" y2="15" strokeWidth="1.8" strokeLinecap="round" />
    </RankTile>
  );
}
