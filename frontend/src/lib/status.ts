export type ReadinessStatus = "READY" | "EASE_BACK" | "BACK_OFF";

export const STATUS_LABEL: Record<ReadinessStatus, string> = {
  BACK_OFF: "Back off",
  EASE_BACK: "Ease back",
  READY: "Ready",
};

export const STATUS_COLOR: Record<ReadinessStatus, string> = {
  BACK_OFF: "var(--orange)",
  EASE_BACK: "var(--gold)",
  READY: "var(--green)",
};

export function statusClass(status: ReadinessStatus): string {
  return `status-${status.toLowerCase()}`;
}
