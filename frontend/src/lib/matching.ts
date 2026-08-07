// Coach-side 1:1 slot matching — ported from the reference design's
// `solveMatching`/`matchWeight`. Slots are ephemeral (component state, not
// persisted), same as the source.

export const TIMES = ["Mon AM", "Tue lunch", "Wed PM", "Thu AM", "Fri lunch"] as const;

export interface Slot {
  id: string;
  time: string;
  type: "full" | "quick";
}

export interface Candidate {
  id: string;
  name: string;
  risk: number; // 0-100, higher = more worth seeing this week
  statusColor: string;
  avail: string[];
}

export interface SlotPick {
  slot: Slot;
  c: Candidate | null;
  w: number;
}

export function deriveAvailability(name: string): string[] {
  const seed = name.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return TIMES.filter((_, i) => ((seed >> i) & 1) === 1 || i === seed % 5);
}

// Weight of assigning candidate c to slot: null means "not available then".
export function matchWeight(slot: Slot, c: Candidate): number | null {
  if (!c.avail.includes(slot.time)) return null;
  let v = c.risk;
  if (slot.type === "full") v += c.risk >= 70 ? 10 : c.risk >= 45 ? 3 : 0;
  else v += c.risk < 45 ? 5 : 0;
  return v;
}

// Small bitmask DP over candidates (slots.length is tiny — at most 6 — so
// this stays cheap even with a few dozen candidates).
export function solveMatching(
  slots: Slot[],
  cands: Candidate[],
  pins: Record<string, string>
): { picks: SlotPick[]; assignedIds: Set<string> } {
  const n = slots.length;
  const memo = new Map<string, { score: number; picks: SlotPick[] }>();

  function dp(i: number, mask: number): { score: number; picks: SlotPick[] } {
    if (i >= n) return { score: 0, picks: [] };
    const key = `${i}|${mask}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const slot = slots[i];
    const pin = pins[slot.id];
    const pinIdx = pin ? cands.findIndex((c) => c.id === pin) : -1;

    let best: { score: number; picks: SlotPick[] };
    if (pinIdx >= 0 && !(mask & (1 << pinIdx))) {
      const c = cands[pinIdx];
      const val = matchWeight(slot, c);
      const sub = dp(i + 1, mask | (1 << pinIdx));
      best = { score: (val || 0) + sub.score, picks: [{ slot, c, w: val || 0 }, ...sub.picks] };
    } else {
      const sub0 = dp(i + 1, mask);
      best = { score: sub0.score, picks: [{ slot, c: null, w: 0 }, ...sub0.picks] };
      for (let idx = 0; idx < cands.length; idx++) {
        if (mask & (1 << idx)) continue;
        const c = cands[idx];
        const val = matchWeight(slot, c);
        if (val == null) continue;
        const sub = dp(i + 1, mask | (1 << idx));
        const score = val + sub.score;
        if (score > best.score) best = { score, picks: [{ slot, c, w: val }, ...sub.picks] };
      }
    }
    memo.set(key, best);
    return best;
  }

  const res = dp(0, 0);
  return { picks: res.picks, assignedIds: new Set(res.picks.filter((p) => p.c).map((p) => p.c!.id)) };
}
