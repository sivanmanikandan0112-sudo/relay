import { describe, expect, it } from "vitest";
import { BACKDATE_WINDOW_DAYS, dayKey, groupByDay, localDayKey, localHour, resolveSubmissionDay } from "./date.js";

describe("dayKey", () => {
  it("truncates to UTC midnight", () => {
    const key = dayKey(new Date("2026-03-15T23:59:59.999Z"));
    expect(key.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });
});

describe("localDayKey", () => {
  it("truncates to Central midnight, not UTC midnight", () => {
    // A real production case: 8:15pm Central on Aug 16 (CDT, UTC-5) is
    // already 1:15am UTC on Aug 17 -- dayKey would call this Aug 17,
    // which is exactly the bug this function exists to avoid (see its
    // own comment in date.ts).
    const eveningCentral = new Date("2026-08-17T01:15:00.000Z");
    expect(dayKey(eveningCentral).toISOString()).toBe("2026-08-17T00:00:00.000Z"); // what dayKey gets wrong
    expect(localDayKey(eveningCentral).toISOString()).toBe("2026-08-16T00:00:00.000Z"); // the actual Central day
  });

  it("agrees with dayKey mid-day, when UTC and Central share the same calendar day", () => {
    const midday = new Date("2026-08-17T18:30:00.000Z"); // 1:30pm Central
    expect(localDayKey(midday).toISOString()).toBe(dayKey(midday).toISOString());
    expect(localDayKey(midday).toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("still agrees with dayKey during CST (winter, UTC-6), not just CDT", () => {
    // 7:00pm Central on Jan 14 (CST) is already 1:00am UTC on Jan 15.
    const winterEvening = new Date("2026-01-15T01:00:00.000Z");
    expect(dayKey(winterEvening).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(localDayKey(winterEvening).toISOString()).toBe("2026-01-14T00:00:00.000Z");
  });
});

describe("localHour", () => {
  it("reads the Central hour, not the UTC hour", () => {
    expect(localHour(new Date("2026-08-17T21:00:00.000Z"))).toBe(16); // 4pm CDT
  });

  it("reads midnight as 0, not 24 (the h23 vs hour12 Intl quirk)", () => {
    expect(localHour(new Date("2026-08-17T05:00:00.000Z"))).toBe(0); // exactly midnight CDT
  });

  it("shifts an hour across the CDT/CST boundary, same instant", () => {
    expect(localHour(new Date("2026-08-17T20:00:00.000Z"))).toBe(15); // 3pm CDT (summer, UTC-5)
    expect(localHour(new Date("2026-01-17T20:00:00.000Z"))).toBe(14); // 2pm CST (winter, UTC-6)
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

  it("accepts a custom key function (e.g. localDayKey) instead of the dayKey default", () => {
    // Same evening-submission instant as localDayKey's own test above --
    // dayKey would split this from the rest of Aug 16's items into its
    // own (wrongly-dated) group; localDayKey keeps it together.
    const items = [new Date("2026-08-16T14:00:00Z"), new Date("2026-08-17T01:15:00.000Z")];
    const utcGroups = groupByDay(items, (d) => d);
    expect(utcGroups).toHaveLength(2); // dayKey splits these onto different UTC days

    const localGroups = groupByDay(items, (d) => d, localDayKey);
    expect(localGroups).toHaveLength(1); // localDayKey correctly keeps them on the same Central day
    expect(localGroups[0].items).toHaveLength(2);
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

  describe("during the evening UTC-rollover window (Central still \"today\", UTC already \"tomorrow\")", () => {
    // 8:15pm Central on Aug 16 -- same instant as localDayKey's own test.
    const eveningCentral = new Date("2026-08-17T01:15:00.000Z");

    it("anchors \"today\" to the Central day, so the athlete's own local today is accepted, not rejected as one day in the future", () => {
      const resolved = resolveSubmissionDay(eveningCentral, "2026-08-16");
      expect(resolved).not.toBeNull();
      expect(resolved!.day.toISOString()).toBe("2026-08-16T00:00:00.000Z");
      expect(resolved!.date).toBe(eveningCentral); // exact instant, not a derived noon stamp -- this is "today", not a backdate
    });

    it("doesn't shift the backdate window a day early", () => {
      // The oldest day the *Central* calendar should still allow --
      // anchoring to raw UTC would compute this one day too far back and
      // wrongly reject it.
      const oldestAllowed = new Date("2026-08-16T00:00:00.000Z");
      oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - (BACKDATE_WINDOW_DAYS - 1));
      const resolved = resolveSubmissionDay(eveningCentral, oldestAllowed.toISOString().slice(0, 10));
      expect(resolved).not.toBeNull();
    });
  });
});
