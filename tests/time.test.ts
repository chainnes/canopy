import { describe, expect, it } from "vitest";
import { shouldRunMorningBrief } from "@/lib/service";
import { parseWhen, zonedISODate } from "@/lib/time";
import { NOW, TZ } from "./helpers";

describe("Manila clock", () => {
  it("converts UTC to the local date", () => {
    expect(zonedISODate(NOW, TZ)).toBe("2026-11-15");
    expect(zonedISODate(new Date("2026-11-14T15:30:00.000Z"), TZ)).toBe("2026-11-14");
  });

  it("reads tomorrow morning as 90 minutes from 09:00", () => {
    const when = parseWhen("Block 90 minutes tomorrow morning for the writeup", NOW, TZ);
    expect(when?.start.toISOString()).toBe("2026-11-16T01:00:00.000Z");
    expect(when?.end.toISOString()).toBe("2026-11-16T02:30:00.000Z");
  });
});

describe("morning brief schedule", () => {
  it("waits until the configured hour and runs once per local day", () => {
    expect(
      shouldRunMorningBrief({
        now: new Date("2026-11-14T23:59:00.000Z"),
        timeZone: TZ,
        hour: 8,
        lastBriefDate: null,
      }),
    ).toBe(false);
    expect(
      shouldRunMorningBrief({
        now: new Date("2026-11-15T00:00:00.000Z"),
        timeZone: TZ,
        hour: 8,
        lastBriefDate: null,
      }),
    ).toBe(true);
    expect(
      shouldRunMorningBrief({
        now: new Date("2026-11-15T00:00:00.000Z"),
        timeZone: TZ,
        hour: 8,
        lastBriefDate: "2026-11-15",
      }),
    ).toBe(false);
    expect(
      shouldRunMorningBrief({
        now: new Date("2026-11-15T00:00:00.000Z"),
        timeZone: TZ,
        hour: 8,
        lastBriefDate: "2026-11-14",
      }),
    ).toBe(true);
  });
});
