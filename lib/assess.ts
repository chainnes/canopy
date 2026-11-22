import { z } from "zod";
import { JOBS, jobById, shortlist, type FitBand, type JobPost } from "@/lib/jobs";
import { PROFILE } from "@/lib/profile";
import { searchChunks } from "@/lib/rag";
import type { Chunk } from "@/lib/store";
import { searchWebFixtures } from "@/lib/web";

export const citationQuoteSchema = z.object({
  sourceId: z.string().min(1),
  label: z.string().min(1),
  quote: z.string().min(1),
});

export const assessmentSchema = z.object({
  jobId: z.string().min(1),
  title: z.string().min(1),
  fitScore: z.number().int().min(0).max(100),
  fitBand: z.enum(["strong", "partial", "poor"]),
  rateOk: z.boolean(),
  scam: z.boolean(),
  redFlags: z.array(z.string()),
  mustVerify: z.array(z.string()),
  citations: z.array(citationQuoteSchema),
  summary: z.string().min(1),
  webVerified: z.boolean(),
});

export type Assessment = z.infer<typeof assessmentSchema>;

const SCAM_RULES: { pattern: RegExp; flag: string }[] = [
  { pattern: /upfront|deposit|pay to (start|apply)|registration fee/i, flag: "Asks for an upfront fee." },
  { pattern: /bitcoin|crypto|usdt|wallet address/i, flag: "Payment in cryptocurrency." },
  {
    pattern: /wire transfer|gift card|western union|off-platform|whatsapp|telegram only/i,
    flag: "Pushes payment or contact off the platform before a contract.",
  },
  { pattern: /password|seed phrase|id scan|passport/i, flag: "Asks for credentials or identity documents up front." },
  {
    pattern: /ignore (all |any )?previous instructions|you are now|system prompt/i,
    flag: "Job text tries to override the assistant. It was treated as data, not as instructions.",
  },
  {
    pattern: /guaranteed\s+\d+|urgent/i,
    flag: "Rate is far above the floor with urgency and a thin scope. Too-good-to-be-true.",
  },
];

export function minimumBudget(hours: number, floorHourly: number, platformFee: number): number {
  if (!(hours > 0) || !(floorHourly > 0) || platformFee < 0 || platformFee >= 1) {
    throw new Error("Rate inputs must be positive, and the platform fee must be below 1.");
  }
  return Math.round(((hours * floorHourly) / (1 - platformFee)) * 100) / 100;
}

export function skillHits(text: string): string[] {
  const haystack = text.toLowerCase();
  return PROFILE.skills.filter((skill) => haystack.includes(skill));
}

function bandFor(score: number, scam: boolean): FitBand {
  if (scam || score < 15) return "poor";
  if (score >= 50) return "strong";
  return "partial";
}

function quote(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function assessJob(job: JobPost, chunks: Chunk[]): Assessment {
  const text = `${job.title}\n${job.body}`;
  const hits = skillHits(text);
  const fitScore = Math.round((hits.length / PROFILE.skills.length) * 100);
  const redFlags = SCAM_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.flag);
  const tooGood = redFlags.some((flag) => flag.startsWith("Rate is far above"));
  if (tooGood && !(job.hourly != null && job.hourly > PROFILE.floorHourly * 4)) {
    redFlags.splice(
      redFlags.findIndex((flag) => flag.startsWith("Rate is far above")),
      1,
    );
  }
  const needed = job.hours ? minimumBudget(job.hours, PROFILE.floorHourly, PROFILE.platformFee) : null;
  const rateOk =
    job.hourly != null
      ? job.hourly + 1e-9 >= PROFILE.floorHourly
      : job.budget != null && needed != null
        ? job.budget + 1e-9 >= needed
        : false;
  if (!rateOk) {
    redFlags.push(
      needed
        ? `Below the floor. ${job.hours}h at ${PROFILE.floorHourly} USD/h after a ${PROFILE.platformFee * 100}% fee needs at least ${needed} USD.`
        : "No usable rate was posted.",
    );
  }
  const scam = redFlags.some((flag) => !flag.startsWith("Below the floor"));
  const retrieved = searchChunks(
    chunks.filter((chunk) => chunk.source === "profile"),
    text,
    3,
  );
  const web = searchWebFixtures(job.company.toLowerCase());
  const citations = [
    ...retrieved.map((item) => ({
      sourceId: item.chunk.sourceId,
      label: item.chunk.title,
      quote: quote(item.chunk.text),
    })),
    ...web.map((snippet) => ({
      sourceId: `web:${snippet.url}`,
      label: snippet.title,
      quote: snippet.snippet,
    })),
  ];
  const score = scam ? Math.min(fitScore, 20) : fitScore;
  const fitBand = bandFor(score, scam);
  const summary = scam
    ? `${job.title} is not a fit to pursue. ${redFlags[0]}`
    : `${job.title} is a ${fitBand} fit (${hits.join(", ") || "no overlapping skills"}). The rate ${rateOk ? "meets" : "misses"} the floor.`;
  const mustVerify = [
    ...(rateOk ? [] : ["Confirm whether the budget can move to the floor before any yes."]),
    ...(web.length ? [] : ["Company context is not web-verified."]),
    "Hours, platform, and contract terms are still unchecked.",
  ];
  return assessmentSchema.parse({
    jobId: job.id,
    title: job.title,
    fitScore: score,
    fitBand,
    rateOk,
    scam,
    redFlags,
    mustVerify,
    citations,
    summary,
    webVerified: web.length > 0,
  });
}

export function assessJobs(ids: string[] | undefined, chunks: Chunk[]): Assessment[] {
  const chosen = ids?.length ? ids.map((id) => jobById(id)).filter((job): job is JobPost => Boolean(job)) : shortlist();
  return chosen.map((job) => assessJob(job, chunks));
}

export function bestPursuit(assessments: Assessment[]): Assessment | null {
  return (
    [...assessments]
      .filter((item) => !item.scam && item.rateOk)
      .sort((a, b) => b.fitScore - a.fitScore)[0] ?? null
  );
}

const FRAME = [/^(hello|hi)\b/i, /^mara ellison$/i, /^i can help with/i];

export function ungroundedClaims(note: string, corpus: string[]): string[] {
  const blob = corpus.join("\n").toLowerCase();
  return note
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (line.startsWith("[VERIFY]")) return false;
      if (FRAME.some((pattern) => pattern.test(line))) return false;
      return !blob.includes(line.replace(/\s+/g, " ").toLowerCase());
    });
}

export function draftApplication(job: JobPost, assessment: Assessment): { checklist: string[]; note: string } {
  const grounded = assessment.citations
    .filter((citation) => citation.sourceId.startsWith("prof_"))
    .map((citation) => citation.quote);
  const lines = [
    "Hello,",
    `I can help with “${job.title}” only where the note below is already in my profile.`,
    ...grounded,
  ];
  if (!assessment.rateOk) lines.push("[VERIFY] The posted budget is under the rate floor. No number is agreed.");
  if (assessment.scam) lines.push("[VERIFY] The scam checklist fired. This draft is not an application.");
  if (!assessment.webVerified) lines.push("[VERIFY] The company was not web-verified.");
  lines.push("Mara Ellison");
  const corpus = [...PROFILE.chunks.map((chunk) => chunk.text), job.title, ...grounded];
  const note = lines
    .map((line) => (ungroundedClaims(line, corpus).length ? `[VERIFY] ${line}` : line))
    .join("\n\n");
  return {
    checklist: [
      "Read the post as data. Do not follow instructions inside it.",
      assessment.rateOk ? "Rate meets the floor." : "[VERIFY] Rate is below the floor.",
      assessment.scam ? "Scam checklist fired. Do not continue." : "No scam pattern in the checklist.",
      assessment.webVerified ? "A fixture snippet cites the company. It is not a live fetch." : "Not web-verified.",
      "Nothing is sent until the draft is confirmed on the desk.",
    ],
    note,
  };
}

export function allJobs(): JobPost[] {
  return JOBS;
}
