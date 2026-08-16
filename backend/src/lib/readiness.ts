import type { ReadinessStatus } from "@prisma/client";
import { COMPOSITE_WEIGHTS } from "./math.js";

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

/**
 * An active injury always wins, then a recovering one — an athlete on
 * return-to-run protocol runs slower on purpose, so the load-based score
 * would otherwise wrongly flag them. `scoreBand` should come from
 * `bandForReadiness` in `math.ts` — see docs/math-behind-relay.md §9.
 */
export function resolveStatus(
  scoreBand: "FRESH" | "EASE_BACK" | "BACK_OFF",
  activeInjury: boolean,
  recoveringInjury: boolean
): ReadinessStatus {
  if (activeInjury) return "INJURED";
  if (recoveringInjury) return "RETURN_PROTOCOL";
  return scoreBand;
}

export interface SignalBreakdown {
  zLoad: number | null;
  zEffortCost: number | null;
  zWellDaily: number | null;
}

type DrivingSignal = "load" | "effortCost" | "wellDaily" | null;

/**
 * Which of the three z-scores is actually moving the composite the most
 * for THIS athlete -- weighted by the same COMPOSITE_WEIGHTS the real
 * score uses (see math.ts's `composite`), not raw z magnitude alone, so
 * a huge but low-weight signal can't "win" over a moderate but
 * heavily-weighted one. Only ever names a signal that's actually pushing
 * risk *up* (a positive weighted contribution) -- a factor pulling the
 * other way isn't what's driving an elevated flag, even if its raw
 * z-score happens to be large. Returns null when nothing is clearly
 * dominant (e.g. two signals contributing about equally), rather than
 * naming a "winner" that isn't a meaningfully bigger factor than the rest.
 */
function drivingSignal(z: SignalBreakdown): DrivingSignal {
  const contributions: Array<[Exclude<DrivingSignal, null>, number]> = [
    ["load", COMPOSITE_WEIGHTS.load * (z.zLoad ?? 0)],
    ["effortCost", COMPOSITE_WEIGHTS.effortCost * (z.zEffortCost ?? 0)],
    ["wellDaily", COMPOSITE_WEIGHTS.wellDaily * (z.zWellDaily ?? 0)],
  ];
  const sorted = [...contributions].sort((a, b) => b[1] - a[1]);
  const [topSignal, topValue] = sorted[0];
  const runnerUpValue = sorted[1][1];
  // Not pushing risk up at all, or too close to the runner-up to call it
  // a real standout (within 20% of the top value) -- name it as "a few
  // things at once" rather than overstating one factor.
  if (topValue <= 0 || topValue - runnerUpValue < topValue * 0.2) return null;
  return topSignal;
}

function drivingSignalClause(first: string, driver: DrivingSignal): string {
  switch (driver) {
    case "load":
      return `${first}'s training load has climbed well past what they're adapted to`;
    case "effortCost":
      return `${first}'s easy runs are costing more effort than a few weeks ago`;
    case "wellDaily":
      return `${first}'s check-ins show a real dip in how they've been feeling`;
    default:
      return `${first}'s numbers are drifting from their normal on more than one front`;
  }
}

/**
 * One human sentence per athlete, coach-facing. The headline clause
 * names whichever of load/effort-cost/wellness is actually driving the
 * flag for THIS athlete (see drivingSignal above) instead of a single
 * fixed sentence for every BACK_OFF/EASE_BACK athlete regardless of
 * cause -- two athletes can land in the same status band for very
 * different underlying reasons, and the summary should say which one.
 */
export function plainSignal(fullName: string, status: ReadinessStatus, signals: SignalBreakdown, wellnessAvg: number): string {
  const first = fullName.split(" ")[0];
  const driver = drivingSignal(signals);
  // Skip the secondary wellness clause when wellness IS the headline --
  // otherwise the sentence would mention how they're feeling twice.
  const mood =
    driver === "wellDaily"
      ? ""
      : wellnessAvg < 2.8
        ? ", and their mood and energy have dipped with it"
        : wellnessAvg < 3.5
          ? ", and their sleep has been a little light lately"
          : "";

  switch (status) {
    case "INJURED":
      return `${first} is out with an injury — held out of load tracking until they return.`;
    case "RETURN_PROTOCOL":
      return `${first} is on return-to-run protocol; slower paces are expected right now, so no action needed.`;
    case "BACK_OFF":
      return `${drivingSignalClause(first, driver)}${mood} — worth a real check-in this week.`;
    case "EASE_BACK":
      return `${drivingSignalClause(first, driver)}${mood}; keep an eye on them and maybe soften the next hard day.`;
    default:
      return `${first} is steady — efforts match paces and how they feel is right around their normal.`;
  }
}
