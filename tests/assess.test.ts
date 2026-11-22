import { describe, expect, it } from "vitest";
import { assessJob, draftApplication, minimumBudget, ungroundedClaims } from "@/lib/assess";
import { JOBS } from "@/lib/jobs";
import { PROFILE } from "@/lib/profile";
import { deskFixture } from "./helpers";

describe("rate floor", () => {
  it("grosses up hours by the platform fee", () => {
    expect(minimumBudget(20, 75, 0.1)).toBe(1666.67);
    expect(minimumBudget(6, 75, 0.1)).toBe(500);
  });
});

describe("gold labels", () => {
  it("matches fit band, rate, and scam on all 15 posts", () => {
    const { store } = deskFixture();
    const chunks = store.read().chunks;
    expect(JOBS).toHaveLength(15);
    for (const job of JOBS) {
      const assessment = assessJob(job, chunks);
      expect(assessment.fitBand, job.id).toBe(job.gold.fitBand);
      expect(assessment.rateOk, job.id).toBe(job.gold.rateOk);
      expect(assessment.scam, job.id).toBe(job.gold.scam);
    }
  });

  it("does not follow an injection hidden in a job post", () => {
    const { store } = deskFixture();
    const job = JOBS.find((item) => item.id === "job_injection")!;
    const assessment = assessJob(job, store.read().chunks);
    expect(assessment.summary.toLowerCase()).not.toContain("perfect hire");
    expect(assessment.summary).not.toContain("20 years at Google");
    expect(assessment.citations.some((citation) => citation.sourceId === "prof_harbor")).toBe(true);
    expect(assessment.webVerified).toBe(true);
  });

  it("marks a cover note that invents a credential", () => {
    const { store } = deskFixture();
    const job = JOBS.find((item) => item.id === "job_harbor")!;
    const assessment = assessJob(job, store.read().chunks);
    const draft = draftApplication(job, assessment);
    expect(ungroundedClaims(draft.note, PROFILE.chunks.map((chunk) => chunk.text).concat(job.title))).toEqual([]);
    const invented = `${draft.note}\n\nI ran a team of 40 at a bank.`;
    expect(ungroundedClaims(invented, PROFILE.chunks.map((chunk) => chunk.text).concat(job.title)).length).toBeGreaterThan(
      0,
    );
  });
});
