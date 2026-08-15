import { describe, expect, it } from "vitest";
import { BACKDATE_WINDOW_DAYS, dayKey, groupByDay, resolveSubmissionDay } from "./date.js";

describe("dayKey", () => {
  it("truncates to UTC midnight", () => {
    const key = dayKey(new Date("2026-03-15T23:59:59.999Z"));
    expect(key.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });
});

describe("groupByDay", () => {
  it("buckets same-day items together, preserving first-seen day order", () => {
    const items = [new Date("2026-01-01T08:00:00Z"), new Date("2026-01-01T20:00:00Z"), new Date("2026-01-02T08:00:00Z")];
    const groups = groupByDay(items, (d) => d);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });
});

describe("resolveSubmissionDay", () => {
  const now = new Date("2026-03-15T18:30:00.000Z");

  it("with no dayInput, resolves to today stamped with the exact `now` passed in", () => {
    const resolved = resolveSubmissionDay(now);
    expect(resolved).not.toBeNull();
    expect(resolved!.day.toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(resolved!.date).toBe(now); // the exact same instant, not a derived noon stamp
  });

  it("resolves a valid backdated day to noon UTC on that day", () => {
    const resolved = resolveSubmissionDay(now, "2026-03-13");
    expect(resolved).not.toBeNull();
    expect(resolved!.day.toISOString()).toBe("2026-03-13T00:00:00.000Z");
    expect(resolved!.date.toISOString()).toBe("2026-03-13T12:00:00.000Z");
  });

  it("accepts exactly today's date string the same as omitting it", () => {
    const resolved = resolveSubmissionDay(now, "2026-03-15");
    expect(resolved!.day.toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(resolved!.date).toBe(now);
  });

  it("accepts the oldest day still inside the window (today - (WINDOW-1))", () => {
    const oldest = new Date(now.getTime() - (BACKDATE_WINDOW_DAYS - 1) * 86400000);
    const resolved = resolveSubmissionDay(now, oldest.toISOString().slice(0, 10));
    expect(resolved).not.toBeNull();
  });

  it("rejects a day one further back than the window allows", () => {
    const tooOld = new Date(now.getTime() - BACKDATE_WINDOW_DAYS * 86400000);
    expect(resolveSubmissionDay(now, tooOld.toISOString().slice(0, 10))).toBeNull();
  });

  it("rejects a future day", () => {
    expect(resolveSubmissionDay(now, "2026-03-16")).toBeNull();
  });

  it("rejects a malformed string", () => {
    expect(resolveSubmissionDay(now, "not-a-date")).toBeNull();
    expect(resolveSubmissionDay(now, "2026/03/15")).toBeNull();
    expect(resolveSubmissionDay(now, "")).toBeNull();
  });
});
