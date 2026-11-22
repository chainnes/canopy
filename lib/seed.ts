import { nid } from "@/lib/ids";
import { reindex } from "@/lib/rag";
import type { DeskState } from "@/lib/store";
import { shiftZonedDate, zonedDateTime, zonedISODate, zonedParts } from "@/lib/time";

export function buildSeed(now: Date, timeZone: string): DeskState {
  const today = zonedParts(now, timeZone);
  const at = (
    offsetDays: number,
    hour: number,
    minute: number,
    durationMin: number,
  ) => {
    const day = shiftZonedDate(today, offsetDays);
    const start = zonedDateTime({ timeZone, ...day, hour, minute });
    return {
      start: start.toISOString(),
      end: new Date(start.getTime() + durationMin * 60_000).toISOString(),
    };
  };
  const due = (offsetDays: number) =>
    zonedISODate(
      zonedDateTime({
        timeZone,
        ...shiftZonedDate(today, offsetDays),
        hour: 12,
        minute: 0,
      }),
      timeZone,
    );
  const stamp = now.toISOString();

  const state: DeskState = {
    version: 1,
    events: [
      {
        id: nid("evt"),
        title: "Deep work: harbor ledger case study",
        ...at(0, 9, 0, 120),
        location: "Home studio",
        notes: "Write the fictional Harbor Ledger sync as a case study. No real client is involved.",
      },
      {
        id: nid("evt"),
        title: "Shortlist review",
        ...at(0, 13, 30, 60),
        location: "Home studio",
        notes: "Score three synthetic posts. Do not send anything.",
      },
      {
        id: nid("evt"),
        title: "Writing block",
        ...at(1, 10, 0, 60),
        location: "Home",
        notes: "Friday afternoons stay free for writing.",
      },
    ],
    tasks: [
      {
        id: nid("tsk"),
        title: "Outline the harbor ledger case study",
        details: "Postgres counts to a webhook. Fictional project only.",
        status: "open",
        priority: "high",
        due: due(0),
        createdAt: stamp,
      },
      {
        id: nid("tsk"),
        title: "Check the rate floor against the shortlist",
        details: "75 USD per hour, 10 percent platform fee.",
        status: "open",
        priority: "medium",
        due: due(1),
        createdAt: stamp,
      },
      {
        id: nid("tsk"),
        title: "File the scam examples",
        details: "Deposit, crypto, off-platform payment, and the injection post.",
        status: "open",
        priority: "low",
        due: due(4),
        createdAt: stamp,
      },
    ],
    notes: [
      {
        id: nid("nte"),
        title: "How the desk should behave",
        body: "Concise replies. One next step. Never send an email or webhook until it is confirmed on the desk.",
        tags: ["preferences"],
        createdAt: stamp,
      },
      {
        id: nid("nte"),
        title: "Harbor Ledger, as a note",
        body: "Fictional nightly TypeScript job. Postgres warehouse counts go out through a webhook. This is sample text for retrieval.",
        tags: ["profile", "harbor"],
        createdAt: stamp,
      },
    ],
    memories: [
      {
        id: nid("mem"),
        kind: "fact",
        text: "Mara Ellison is a fictional freelance automation consultant. This desk is sample data, not a real CV.",
        createdAt: stamp,
      },
      {
        id: nid("mem"),
        kind: "preference",
        text: "Timezone is Asia/Manila. Deep work belongs in the morning.",
        createdAt: stamp,
      },
      {
        id: nid("mem"),
        kind: "preference",
        text: "Replies should be short and end with one concrete next step.",
        createdAt: stamp,
      },
      {
        id: nid("mem"),
        kind: "preference",
        text: "Never send email or call a webhook without an explicit confirmation on the desk.",
        createdAt: stamp,
      },
    ],
    actions: [],
    messages: [],
    briefs: [],
    lastBriefDate: null,
    chunks: [],
    embeddingModel: "",
    reviewQueue: [],
    assessments: [],
    safetyFindings: [],
  };
  reindex(state);
  return state;
}

export const SAMPLE_INQUIRY = {
  source: "board.example",
  type: "inquiry",
  from: "maya@example.com",
  subject: "Webhook router quote",
  body: "Hi Mara — could you scope a TypeScript webhook router, about twelve hours, paid on the platform?",
};
