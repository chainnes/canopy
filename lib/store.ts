import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DeskError } from "@/lib/schema";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string;
  notes: string;
};

export type Task = {
  id: string;
  title: string;
  details: string;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
  due: string | null;
  createdAt: string;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
};

export type Memory = {
  id: string;
  kind: "preference" | "fact" | "person";
  text: string;
  createdAt: string;
};

export type OutboundAction = {
  id: string;
  channel: "email" | "webhook";
  to: string;
  subject: string;
  body: string;
  reason: string;
  status: "pending" | "sent" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  delivery: "simulated" | "webhook" | null;
  deliveryDetail: string | null;
};

export type ToolTrace = {
  name: string;
  args: unknown;
  ok: boolean;
  summary: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Full text the model sees when the transcript should stay short. */
  modelContent?: string;
  createdAt: string;
  intent?: string;
  traces?: ToolTrace[];
  pendingActionIds?: string[];
};

export type Brief = {
  id: string;
  forDate: string;
  text: string;
  createdAt: string;
  source: "schedule" | "manual";
};

export type Chunk = {
  id: string;
  source: "profile" | "note" | "memory";
  sourceId: string;
  title: string;
  text: string;
  embedding: number[];
};

export type ReviewItem = {
  id: string;
  reason: string;
  raw: string;
  kind: "assistant_turn" | "assessment";
  status: "open" | "resolved";
  createdAt: string;
};

export type StoredAssessment = {
  id: string;
  createdAt: string;
  jobId: string;
  title: string;
  fitScore: number;
  fitBand: "strong" | "partial" | "poor";
  rateOk: boolean;
  scam: boolean;
  redFlags: string[];
  mustVerify: string[];
  citations: { sourceId: string; label: string; quote: string }[];
  summary: string;
  webVerified: boolean;
};

export type SafetyFinding = {
  id: string;
  jobId: string;
  kind: string;
  detail: string;
  createdAt: string;
};

export type DeskState = {
  version: 1;
  events: CalendarEvent[];
  tasks: Task[];
  notes: Note[];
  memories: Memory[];
  actions: OutboundAction[];
  messages: ChatMessage[];
  briefs: Brief[];
  lastBriefDate: string | null;
  chunks: Chunk[];
  embeddingModel: string;
  reviewQueue: ReviewItem[];
  assessments: StoredAssessment[];
  safetyFindings: SafetyFinding[];
};

export function emptyState(): DeskState {
  return {
    version: 1,
    events: [],
    tasks: [],
    notes: [],
    memories: [],
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
}

export function normalizeState(parsed: Partial<DeskState>): DeskState {
  const base = emptyState();
  return {
    ...base,
    ...parsed,
    version: 1,
    events: parsed.events ?? [],
    tasks: parsed.tasks ?? [],
    notes: parsed.notes ?? [],
    memories: parsed.memories ?? [],
    actions: parsed.actions ?? [],
    messages: parsed.messages ?? [],
    briefs: parsed.briefs ?? [],
    lastBriefDate: parsed.lastBriefDate ?? null,
    chunks: parsed.chunks ?? [],
    embeddingModel: parsed.embeddingModel ?? "",
    reviewQueue: parsed.reviewQueue ?? [],
    assessments: parsed.assessments ?? [],
    safetyFindings: parsed.safetyFindings ?? [],
  };
}

const locks = new Map<string, Promise<void>>();

export class Store {
  constructor(readonly file: string) {}

  exists(): boolean {
    try {
      readFileSync(this.file, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  read(): DeskState {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as DeskState;
      if (parsed.version !== 1) {
        throw new DeskError("The desk file is from an unsupported version.", 500);
      }
      return normalizeState(parsed);
    } catch (error) {
      if (error instanceof DeskError) throw error;
      throw new DeskError("The desk file could not be read.", 500);
    }
  }

  write(state: DeskState): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(state, null, 2));
    renameSync(temp, this.file);
  }

  async transact<T>(fn: (state: DeskState) => T): Promise<T> {
    const previous = locks.get(this.file) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(
      this.file,
      previous.then(() => current),
    );
    await previous;
    try {
      const state = this.read();
      const result = fn(state);
      this.write(state);
      return result;
    } finally {
      release();
    }
  }
}
