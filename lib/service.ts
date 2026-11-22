import { runTurn } from "@/lib/agent";
import type { AppConfig } from "@/lib/config";
import { nid } from "@/lib/ids";
import { JOBS } from "@/lib/jobs";
import { inboundMessage } from "@/lib/planner";
import type { LlmProvider } from "@/lib/provider";
import { DeskError, type InboundPayload } from "@/lib/schema";
import { buildSeed } from "@/lib/seed";
import type { Brief, DeskState, OutboundAction, Store } from "@/lib/store";
import { executeTool } from "@/lib/tools";
import { zonedISODate, zonedParts } from "@/lib/time";

export type DeskMeta = {
  provider: string;
  model: string;
  timeZone: string;
  now: string;
  today: string;
  demoUi: boolean;
  outboundConfigured: boolean;
  schedulerEnabled: boolean;
};

export type DeskView = {
  meta: DeskMeta;
  events: DeskState["events"];
  tasks: DeskState["tasks"];
  notes: DeskState["notes"];
  memories: DeskState["memories"];
  actions: DeskState["actions"];
  messages: DeskState["messages"];
  briefs: DeskState["briefs"];
  assessments: DeskState["assessments"];
  reviewQueue: DeskState["reviewQueue"];
  safetyFindings: DeskState["safetyFindings"];
  jobs: {
    id: string;
    title: string;
    company: string;
    hours: number | null;
    hourly: number | null;
    budget: number | null;
    shortlist: boolean;
  }[];
};

export function present(state: DeskState, config: AppConfig, now = new Date()): DeskView {
  return {
    meta: {
      provider: config.provider,
      model: config.model,
      timeZone: config.timeZone,
      now: now.toISOString(),
      today: zonedISODate(now, config.timeZone),
      demoUi: config.demoUi,
      outboundConfigured: Boolean(config.outboundWebhookUrl),
      schedulerEnabled: config.schedulerEnabled,
    },
    events: [...state.events].sort((a, b) => a.start.localeCompare(b.start)),
    tasks: state.tasks,
    notes: state.notes,
    memories: state.memories,
    actions: [...state.actions].sort((a, b) => {
      if (a.status === b.status) return b.createdAt.localeCompare(a.createdAt);
      if (a.status === "pending") return -1;
      if (b.status === "pending") return 1;
      return b.createdAt.localeCompare(a.createdAt);
    }),
    messages: state.messages.map((message) => {
      const copy = { ...message };
      delete copy.modelContent;
      return copy;
    }),
    briefs: state.briefs,
    assessments: state.assessments,
    reviewQueue: state.reviewQueue,
    safetyFindings: state.safetyFindings,
    jobs: JOBS.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      hours: job.hours,
      hourly: job.hourly,
      budget: job.budget,
      shortlist: job.shortlist,
    })),
  };
}

export async function chat(input: {
  store: Store;
  provider: LlmProvider;
  config: AppConfig;
  message: string;
  now?: Date;
}): Promise<DeskView> {
  await runTurn({
    store: input.store,
    provider: input.provider,
    message: input.message,
    now: input.now,
    timeZone: input.config.timeZone,
  });
  return present(input.store.read(), input.config, input.now);
}

export async function ingestInbound(input: {
  store: Store;
  provider: LlmProvider;
  config: AppConfig;
  payload: InboundPayload;
  now?: Date;
}): Promise<DeskView & { pendingActionId: string | null }> {
  const before = new Set(input.store.read().actions.map((action) => action.id));
  await runTurn({
    store: input.store,
    provider: input.provider,
    message: `Studio inquiry from ${input.payload.from} about “${input.payload.subject}”.`,
    modelMessage: inboundMessage(input.payload),
    now: input.now,
    timeZone: input.config.timeZone,
  });
  const created = input.store.read().actions.find((action) => !before.has(action.id) && action.status === "pending");
  return { ...present(input.store.read(), input.config, input.now), pendingActionId: created?.id ?? null };
}

export async function confirmAction(input: {
  store: Store;
  id: string;
  now?: Date;
  outboundWebhookUrl: string;
  config: AppConfig;
  fetchImpl?: typeof fetch;
}): Promise<DeskView> {
  const now = input.now ?? new Date();
  const current = input.store.read().actions.find((action) => action.id === input.id);
  if (!current) throw new DeskError("No draft with that id.", 404);
  if (current.status !== "pending") {
    throw new DeskError(`This draft is already ${current.status}.`, 409);
  }

  const delivery = await deliver(current, input.outboundWebhookUrl, input.fetchImpl ?? fetch);
  await input.store.transact((state) => {
    const action = state.actions.find((item) => item.id === input.id);
    if (!action || action.status !== "pending") return;
    action.status = "sent";
    action.resolvedAt = now.toISOString();
    action.delivery = delivery.delivery;
    action.deliveryDetail = delivery.detail;
  });
  return present(input.store.read(), input.config, now);
}

export async function rejectAction(input: {
  store: Store;
  id: string;
  now?: Date;
  config: AppConfig;
}): Promise<DeskView> {
  const now = input.now ?? new Date();
  const current = input.store.read().actions.find((action) => action.id === input.id);
  if (!current) throw new DeskError("No draft with that id.", 404);
  if (current.status !== "pending") {
    throw new DeskError(`This draft is already ${current.status}.`, 409);
  }
  await input.store.transact((state) => {
    const action = state.actions.find((item) => item.id === input.id);
    if (!action || action.status !== "pending") return;
    action.status = "rejected";
    action.resolvedAt = now.toISOString();
    action.delivery = null;
    action.deliveryDetail = "Rejected on the desk. Nothing was sent.";
  });
  return present(input.store.read(), input.config, now);
}

async function deliver(
  action: OutboundAction,
  outboundWebhookUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ delivery: "simulated" | "webhook"; detail: string }> {
  if (action.channel === "webhook" && outboundWebhookUrl) {
    let response: Response;
    try {
      response = await fetchImpl(outboundWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: action.to,
          subject: action.subject,
          body: action.body,
          reason: action.reason,
        }),
      });
    } catch {
      throw new DeskError("The outbound webhook could not be reached. The draft is still pending.", 502);
    }
    if (!response.ok) {
      throw new DeskError(
        `The outbound webhook returned ${response.status}. The draft is still pending.`,
        502,
      );
    }
    return { delivery: "webhook", detail: `Posted to the configured outbound URL (${response.status}).` };
  }
  if (action.channel === "email") {
    return {
      delivery: "simulated",
      detail: "Simulated email. No mail provider is configured, so nothing left the machine.",
    };
  }
  return {
    delivery: "simulated",
    detail: "Recorded locally. OUTBOUND_WEBHOOK_URL is empty, so nothing was posted.",
  };
}

export async function runMorningBrief(input: {
  store: Store;
  provider: LlmProvider;
  config: AppConfig;
  now?: Date;
  source: Brief["source"];
  force?: boolean;
}): Promise<DeskView & { skipped: boolean; brief: Brief | null }> {
  const now = input.now ?? new Date();
  const today = zonedISODate(now, input.config.timeZone);
  const existing = input.store.read();
  if (!input.force && existing.lastBriefDate === today) {
    const brief = existing.briefs.find((item) => item.forDate === today) ?? null;
    return { ...present(existing, input.config, now), skipped: true, brief };
  }
  const assistant = await runTurn({
    store: input.store,
    provider: input.provider,
    message: `Morning brief for ${today}.`,
    modelMessage: `Build my morning brief for ${today}. Read the calendar, open tasks, and what you remember.`,
    now,
    timeZone: input.config.timeZone,
  });
  const brief: Brief = {
    id: nid("brf"),
    forDate: today,
    text: assistant.content,
    createdAt: now.toISOString(),
    source: input.source,
  };
  await input.store.transact((state) => {
    state.lastBriefDate = today;
    state.briefs = [brief, ...state.briefs.filter((item) => item.forDate !== today)].slice(0, 14);
  });
  return { ...present(input.store.read(), input.config, now), skipped: false, brief };
}

export async function resetDesk(store: Store, config: AppConfig, now = new Date()): Promise<DeskView> {
  store.write(buildSeed(now, config.timeZone));
  return present(store.read(), config, now);
}

export async function completeTask(input: {
  store: Store;
  id: string;
  config: AppConfig;
  now?: Date;
}): Promise<DeskView> {
  const now = input.now ?? new Date();
  await input.store.transact((state) => {
    const result = executeTool(state, "complete_task", { id: input.id }, {
      now,
      timeZone: input.config.timeZone,
    });
    if (!result.ok) throw new DeskError(result.summary, 404);
  });
  return present(input.store.read(), input.config, now);
}

export function shouldRunMorningBrief(input: {
  now: Date;
  timeZone: string;
  hour: number;
  lastBriefDate: string | null;
}): boolean {
  const parts = zonedParts(input.now, input.timeZone);
  if (parts.hour < input.hour) return false;
  return input.lastBriefDate !== zonedISODate(input.now, input.timeZone);
}
