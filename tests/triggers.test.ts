import { describe, expect, it } from "vitest";
import { runMorningBrief } from "@/lib/service";
import { NOW, deskFixture } from "./helpers";

describe("morning brief trigger", () => {
  it("is idempotent for a local day unless forced", async () => {
    const { store, provider, config } = deskFixture();
    const first = await runMorningBrief({
      store,
      provider,
      config,
      now: NOW,
      source: "manual",
    });
    expect(first.skipped).toBe(false);
    expect(first.brief?.text).toContain("Deep work: harbor ledger case study");
    const second = await runMorningBrief({
      store,
      provider,
      config,
      now: NOW,
      source: "schedule",
    });
    expect(second.skipped).toBe(true);
    expect(store.read().briefs).toHaveLength(1);
    const third = await runMorningBrief({
      store,
      provider,
      config,
      now: NOW,
      source: "manual",
      force: true,
    });
    expect(third.skipped).toBe(false);
    expect(store.read().briefs).toHaveLength(1);
    expect(store.read().lastBriefDate).toBe("2026-11-15");
  });
});
