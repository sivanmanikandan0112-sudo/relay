import { beforeEach, describe, expect, it } from "vitest";
import { checkinRateSeries } from "../../src/lib/activityStats.js";
import { localDayKey } from "../../src/lib/date.js";
import { assignRoster, createAthlete, createCoach, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

beforeEach(async () => {
  await resetDb();
});

describe("checkinRateSeries", () => {
  it("counts a real evening check-in on today's point, even during the UTC-rollover window", async () => {
    // 8:15pm Central on Aug 16 (CDT, UTC-5) -- already 1:15am UTC on
    // Aug 17. This is the exact scenario that used to make a coach's
    // board read "0 checked in today" for a squad that genuinely had:
    // checkinRateSeries used to re-derive each entry's day from its raw
    // `date` timestamp via dayKey (UTC truncation), and anchor "today"
    // itself the same way -- both wrong here, since the entry's own
    // `day` field (set by resolveSubmissionDay) already correctly says
    // Aug 16, matching the athlete's real local "today".
    const eveningCentral = new Date("2026-08-17T01:15:00.000Z");
    const realLocalToday = localDayKey(eveningCentral); // 2026-08-16

    const coach = await createCoach({ username: "coach.activitystats", firstName: "Stats", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.activitystats", firstName: "Real", lastName: "Athlete", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, day: realLocalToday, date: eveningCentral, sleep: 4, soreness: 2, mood: 4, energy: 4, motivation: 4 },
    });

    const series = await checkinRateSeries([athlete.id], 3, eveningCentral);
    expect(series).toHaveLength(3);

    const todayPoint = series[2]; // last point = "today" as of eveningCentral
    expect(todayPoint.date).toBe(realLocalToday.toISOString().slice(0, 10));
    expect(todayPoint.checkedIn).toBe(1); // not 0 -- the real bug this test guards against
    expect(todayPoint.total).toBe(1);
    expect(todayPoint.rate).toBe(1);
  });

  it("still agrees with raw-UTC bucketing mid-day, when there's no local/UTC day mismatch to matter", async () => {
    const midday = new Date("2026-08-17T18:30:00.000Z"); // 1:30pm Central, same UTC and Central day
    const coach = await createCoach({ username: "coach.activitystats.midday", firstName: "Midday", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.activitystats.midday", firstName: "Mid", lastName: "Day", squad: "BOYS" });
    await assignRoster(coach.id, athlete.id);
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, day: localDayKey(midday), date: midday, sleep: 3, soreness: 3, mood: 3, energy: 3, motivation: 3 },
    });

    const series = await checkinRateSeries([athlete.id], 1, midday);
    expect(series).toHaveLength(1);
    expect(series[0].checkedIn).toBe(1);
  });

  it("a roster with no athletes gets a series of nulls, not zeros", async () => {
    const series = await checkinRateSeries([], 3, new Date("2026-08-17T01:15:00.000Z"));
    expect(series).toHaveLength(3);
    for (const point of series) {
      expect(point.total).toBe(0);
      expect(point.checkedIn).toBe(0);
      expect(point.rate).toBeNull();
    }
  });
});
