export type ReadinessStatus = "FRESH" | "EASE_BACK" | "BACK_OFF" | "RETURN_PROTOCOL" | "INJURED";

export const STATUS_LABEL: Record<ReadinessStatus, string> = {
  FRESH: "Fresh",
  EASE_BACK: "Ease back",
  BACK_OFF: "Back off",
  RETURN_PROTOCOL: "Return protocol",
  INJURED: "Injured",
};

export const STATUS_COLOR: Record<ReadinessStatus, string> = {
  FRESH: "#4ea373",
  EASE_BACK: "#d9a53c",
  BACK_OFF: "#cf5236",
  RETURN_PROTOCOL: "#3d9c9c",
  INJURED: "#7a8291",
};

export function statusClass(status: ReadinessStatus): string {
  return `status-${status.toLowerCase().replace(/_/g, "-")}`;
}

// Injured/return-protocol athletes aren't being load-tracked, so the
// underlying number isn't a meaningful "readiness" — don't show it as one.
export function scoreIsMeaningful(status: ReadinessStatus): boolean {
  return status !== "INJURED" && status !== "RETURN_PROTOCOL";
}

// Mirrors lib/math.ts's own MIN_HISTORY_DAYS/CHRONIC_WINDOW_DAYS on the
// backend -- below MIN_HISTORY_DAYS the z-score pipeline has no signal at
// all yet (the stored score is a flat neutral default, not a real read on
// this athlete); below CHRONIC_WINDOW_DAYS the pipeline is producing real
// signal but hasn't fully settled, so the number is noisier than it will
// be once it has.
export const MIN_HISTORY_DAYS = 14;
export const CHRONIC_WINDOW_DAYS = 28;

export interface DataConfidence {
  label: string;
  detail: string;
  color: string;
}

/**
 * A purely-presentational confidence layer on top of a already-computed
 * readiness score -- doesn't change the number, just how much weight a
 * coach or athlete should put on it before there's enough of the
 * athlete's own history for the pipeline to have settled. `daysOfHistory`
 * is a snapshot of how much history existed *when that particular score
 * was computed* (ReadinessScore.daysOfHistory), not today's day-count --
 * so a past week's badge reflects what was true then. Returns null once
 * fully settled (nothing to caveat), or for a score computed before this
 * was tracked (null daysOfHistory) -- show nothing rather than guess.
 */
export function dataConfidence(daysOfHistory: number | null): DataConfidence | null {
  if (daysOfHistory == null) return null;
  if (daysOfHistory < MIN_HISTORY_DAYS) {
    return {
      label: "Building",
      detail: `Not enough history yet for this number to mean much — real signal starts after ${MIN_HISTORY_DAYS} days of check-ins and runs.`,
      color: "#d9a53c",
    };
  }
  if (daysOfHistory < CHRONIC_WINDOW_DAYS) {
    return {
      label: `${daysOfHistory}/${CHRONIC_WINDOW_DAYS}d`,
      detail: `Still settling in — becomes fully reliable after ${CHRONIC_WINDOW_DAYS} days of tracking. Use it as directional for now.`,
      color: "#d9a53c",
    };
  }
  return null;
}
