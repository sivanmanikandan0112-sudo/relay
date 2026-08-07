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
