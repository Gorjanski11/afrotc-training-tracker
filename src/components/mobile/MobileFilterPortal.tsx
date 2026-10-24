import { createPortal } from "react-dom";

/**
 * Portals a screen's own filter controls into the TO's tab's phone-only FilterSubtabDock (Section:
 * TrainingObjectivesApp) instead of rendering them inline -- renders nothing when `target` is null
 * (desktop, where the screen's normal inline filter row shows instead, or this screen isn't the
 * currently active one so it isn't holding the dock's target at all).
 */
export function MobileFilterPortal({ target, children }: { target: HTMLDivElement | null; children: React.ReactNode }) {
  if (!target) return null;
  return createPortal(children, target);
}
