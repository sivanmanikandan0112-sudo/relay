import type { ReadinessStatus } from "@prisma/client";

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

/**
 * One human sentence per athlete, coach-facing. Matches the reference
 * design's plain-language generator.
 */
export function plainSignal(fullName: string, status: ReadinessStatus, wellnessAvg: number): string {
  const first = fullName.split(" ")[0];
  const mood =
    wellnessAvg < 2.8
      ? "and their mood and energy have dipped with it"
      : wellnessAvg < 3.5
        ? "and their sleep has been a little light lately"
        : "though how they feel is holding steady";

  switch (status) {
    case "INJURED":
      return `${first} is out with an injury — held out of load tracking until they return.`;
    case "RETURN_PROTOCOL":
      return `${first} is on return-to-run protocol; slower paces are expected right now, so no action needed.`;
    case "BACK_OFF":
      return `${first}'s easy runs are costing more effort than a few weeks ago, ${mood} — worth a real check-in this week.`;
    case "EASE_BACK":
      return `${first}'s load is creeping up ${mood}; keep an eye on them and maybe soften the next hard day.`;
    default:
      return `${first} is steady — efforts match paces and how they feel is right around their normal.`;
  }
}
