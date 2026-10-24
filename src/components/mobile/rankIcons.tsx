/**
 * C/3C (GMC rank: 3 chevrons) and C/Capt (POC rank: 2 bars) insignia tiles, redrawn as small flat
 * vector icons -- used in place of the generic ListChecks icon for GMC Log/POC Log in the phone
 * EdgeSidebar (Section: TO's tab mobile nav). Redrawn rather than cropped from the reference photo
 * since that photo is a printed rank chart with hand-drawn red circles and JPEG artifacts; these are
 * plain geometric shapes so a clean redraw matches the real insignia better than a crop would.
 */

function RankTile({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="3" width="22" height="18" rx="2" fill="var(--foreground)" />
      {children}
    </svg>
  );
}

export function C3CRankIcon({ className }: { className?: string }) {
  return (
    <RankTile className={className}>
      {[7.5, 12, 16.5].map((y) => (
        <path key={y} d={`M5 ${y} L12 ${y - 3} L19 ${y} L19 ${y + 1.6} L12 ${y - 1.4} L5 ${y + 1.6} Z`} fill="var(--background)" />
      ))}
    </RankTile>
  );
}

export function CCaptRankIcon({ className }: { className?: string }) {
  return (
    <RankTile className={className}>
      <rect x="5" y="8" width="14" height="2.6" fill="var(--background)" />
      <rect x="5" y="13.4" width="14" height="2.6" fill="var(--background)" />
    </RankTile>
  );
}
