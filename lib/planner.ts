import type { AssistantTurn } from "@/lib/schema";
import type { Memory } from "@/lib/store";
import { todayWindow } from "@/lib/tools";
import { formatRange, parseWhen, zonedISODate } from "@/lib/time";

export type PlannedCall = {
  name: string;
  args: Record<string, unknown>;
};

export type ToolPayload = {
  name: string;
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
};

type Clock = { now: Date; timeZone: string };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function nextMockStep(
  text: string,
  done: ToolPayload[],
  clock: Clock,
): { type: "tools"; calls: PlannedCall[] } | { type: "final"; turn: AssistantTurn } {
  const names = new Set(done.map((item) => item.name));
  const inbound = parseInbound(text);
  const wantsDraft =
    Boolean(inbound) ||
    (/\b(draft|compose|write|send)\b/i.test(text) &&
      /\b(reply|email|e-mail|webhook|message)\b/i.test(text));
  const wantsBrief = /\b(brief|on my plate|plan my day|what(?:'s| is) on)\b/i.test(text);
  const wantsAssess = /\bassess\b/i.test(text) && /\b(job|shortlist|fit)\b/i.test(text);

  if (wantsAssess && !inbound) {
    if (!names.has("assess_jobs")) {
      return {
        type: "tools",
        calls: [
          { name: "search_knowledge", args: { query: "profile skills projects rate floor" } },
          { name: "assess_jobs", args: {} },
          { name: "web_search", args: { query: "harbor ledger" } },
        ],
      };
    }
    if (!names.has("draft_application")) {
      const best = bestAssessmentId(done);
      if (best) return { type: "tools", calls: [{ name: "draft_application", args: { jobId: best } }] };
    }
    return { type: "final", turn: composeReply(text, done, clock) };
  }

  if (wantsBrief && !inbound) {
    if (!done.length) {
      const offset = /\btomorrow\b/i.test(text) && !/\btoday\b/i.test(text) ? 1 : 0;
      const window = todayWindow(clock.now, clock.timeZone, offset);
      return {
        type: "tools",
        calls: [
          { name: "list_events", args: window },
          { name: "list_tasks", args: { status: "open" } },
          { name: "recall_memory", args: { query: "how I like to work" } },
          { name: "list_pending", args: {} },
        ],
      };
    }
    return { type: "final", turn: composeReply(text, done, clock) };
  }
  if (wantsDraft && !names.has("recall_memory")) {
    return { type: "tools", calls: [{ name: "recall_memory", args: { query: "preferences tone confirmation" } }] };
  }
  if (wantsDraft && !names.has("draft_outbound")) {
    return { type: "tools", calls: [draftCall(text, inbound, memoriesFrom(done))] };
  }
  if (!done.length) {
    const calls = planWritesAndReads(text, clock);
    if (calls.length) return { type: "tools", calls };
  }
  return { type: "final", turn: composeReply(text, done, clock) };
}

function planWritesAndReads(text: string, clock: Clock): PlannedCall[] {
  const calls: PlannedCall[] = [];
  const eventClause = text.match(/\b(?:block|schedule|book)\b[\s\S]*?(?=\band\s+(?:add|create|make)\b|$)/i)?.[0] ?? text;
  const taskClause = text.match(/\b(?:add|create|make)\s+(?:a\s+)?task\b[\s\S]*/i)?.[0] ?? "";

  const eventTitle = extractEventTitle(text);
  if (eventTitle) {
    const when = parseWhen(eventClause, clock.now, clock.timeZone);
    if (when) {
      calls.push({
        name: "create_event",
        args: {
          title: sentenceCase(eventTitle),
          start: when.start.toISOString(),
          end: when.end.toISOString(),
          location: "",
          notes: "",
        },
      });
    }
  }

  const taskTitle = extractTaskTitle(text);
  if (taskTitle) {
    const when = taskClause ? parseWhen(taskClause, clock.now, clock.timeZone) : null;
    calls.push({
      name: "create_task",
      args: {
        title: sentenceCase(taskTitle),
        details: "",
        priority: /\b(urgent|asap|high priority)\b/i.test(text) ? "high" : "medium",
        due: when ? zonedISODate(when.start, clock.timeZone) : null,
      },
    });
  }

  const remember = text.match(/\bremember that\s+(.+?)(?:\.|$)/i);
  if (remember) {
    const fact = clean(remember[1]);
    const kind = /\b(prefer|protect|always|never|keep)\b/i.test(fact) ? "preference" : "fact";
    calls.push({ name: "remember", args: { text: fact, kind } });
  }

  const note = text.match(/\b(?:note that|jot down|write a note:?)\s+(.+?)(?:\.|$)/i);
  if (note) {
    const body = clean(note[1]);
    calls.push({
      name: "create_note",
      args: { title: sentenceCase(body).slice(0, 80), body, tags: [] },
    });
  }

  const doneTask = text.match(/\b(?:complete|finish|mark)\s+(?:the\s+)?(.+?)\s+done\b/i);
  if (doneTask) {
    calls.push({ name: "complete_task", args: { title: clean(doneTask[1]) } });
  }

  if (calls.length) return calls;

  if (/\bwhat do you remember\b|\bwhat have you remembered\b/i.test(text)) {
    calls.push({ name: "recall_memory", args: { query: text } });
  } else if (/\b(notes?|wrote|sensor|chainnes|esp32)\b/i.test(text)) {
    calls.push({ name: "search_notes", args: { query: text } });
  }
  if (/\b(tasks|to-?dos?)\b/i.test(text)) {
    calls.push({ name: "list_tasks", args: { status: "open" } });
  }
  if (/\b(calendar|schedule|today|tomorrow)\b/i.test(text)) {
    const offset = /\btomorrow\b/i.test(text) && !/\btoday\b/i.test(text) ? 1 : 0;
    calls.push({ name: "list_events", args: todayWindow(clock.now, clock.timeZone, offset) });
  }
  return calls;
}

function draftCall(
  text: string,
  inbound: { from: string; subject: string; body: string } | null,
  memories: Memory[],
): PlannedCall {
  const email = inbound?.from || text.match(EMAIL)?.[0] || "unknown@example.com";
  const channel = !inbound && /\bwebhook\b/i.test(text) ? "webhook" : "email";
  const about =
    inbound?.subject ||
    clean(text.match(/\babout\s+(.+?)(?:\.|$)/i)?.[1] || "your note");
  const name = displayName(email);
  const quiet = memories.some((memory) => /short|concise/i.test(memory.text));
  const closing = quiet ? "Chai" : "Charlene";
  const body = inbound
    ? `Hi ${name},\n\nThank you for writing about “${inbound.subject}”.\n\n${firstSentence(inbound.body)}\n\nI can look at a short session from Quezon City if that morning is free. Send a date and I will check the desk before I promise it.\n\n${closing}`
    : `Hi ${name},\n\nThank you for the note about ${about}. I can look at it from Quezon City once the time is actually free, and I will check the desk before I promise a date.\n\n${closing}`;
  return {
    name: "draft_outbound",
    args: {
      channel,
      to: email,
      subject: inbound ? `Re: ${inbound.subject}` : sentenceCase(about),
      body,
      reason: inbound
        ? `Inbound ${inbound.subject} is waiting for a reply.`
        : "You asked for a draft. It stays parked until you confirm.",
    },
  };
}

function bestAssessmentId(done: ToolPayload[]): string | null {
  const ranked = done
    .flatMap((item) => (item.name === "assess_jobs" ? asArray(item.data.assessments) : []))
    .filter((item) => item.scam !== true && item.rateOk === true)
    .sort((a, b) => Number(b.fitScore) - Number(a.fitScore));
  return ranked[0]?.jobId ? String(ranked[0].jobId) : null;
}

function composeReply(text: string, done: ToolPayload[], clock: Clock): AssistantTurn {
  const citations = citationsFrom(done);
  const pending = pendingIds(done);
  const memories = memoriesFrom(done).map((memory) => memory.text);
  const created = done.filter((item) => item.ok && ["create_event", "create_task", "create_note", "remember", "complete_task"].includes(item.name));
  const failed = done.filter((item) => !item.ok);
  const assessments = done.flatMap((item) => (item.name === "assess_jobs" ? asArray(item.data.assessments) : []));

  if (assessments.length) {
    const lines = assessments.map(
      (item) =>
        `• ${String(item.title)}: ${String(item.fitBand)} (${String(item.fitScore)}), rate ${item.rateOk ? "meets the floor" : "below the floor"}${item.scam ? ", scam checklist" : ""}`,
    );
    const chosen =
      assessments.find((item) => String(item.jobId) === bestAssessmentId(done)) ?? assessments[0];
    const parked = done.some((item) => item.name === "draft_application" && item.ok);
    return {
      reply: `Plan: retrieve the profile, score the shortlist, park one draft.\n\n${lines.join("\n")}\n\n${parked ? "A cover note is parked under Pending. Nothing was sent." : "No draft was parked."}\n\nNext step: read the flags, then confirm or reject the draft.`,
      intent: "assess",
      plan: {
        steps: ["Retrieve profile chunks", "Score fit, rate, and scam risk", "Park a grounded draft for review"],
      },
      assessment: chosen as AssistantTurn["assessment"],
      citations: [
        ...citations,
        ...asArray(chosen?.citations).map((item) => ({
          type: String(item.sourceId).startsWith("web:") ? ("web" as const) : ("profile" as const),
          id: String(item.sourceId),
          label: String(item.label),
        })),
      ],
      pendingActionIds: pending,
      memoryUpdates: [],
    };
  }

  if (done.some((item) => item.name === "draft_outbound" && item.ok)) {
    const action = done.find((item) => item.name === "draft_outbound")?.data.action as
      | { to?: string; subject?: string; channel?: string }
      | undefined;
    return {
      reply: `I parked a ${action?.channel === "webhook" ? "webhook" : "reply"} to ${action?.to ?? "the recipient"} (“${action?.subject ?? "draft"}”). Nothing left the machine.\n\nNext step: read it under Pending, then confirm or reject it.`,
      intent: "draft",
      citations,
      pendingActionIds: pending,
      memoryUpdates: [],
    };
  }

  if (created.length) {
    const lines = created.map((item) => describeMutation(item, clock));
    const remembered = created.filter((item) => item.name === "remember").map((item) => {
      const memory = item.data.memory as { text?: string } | undefined;
      return memory?.text ?? "";
    }).filter(Boolean);
    return {
      reply: `${lines.join(" ")}`.trim() + "\n\nNext step: it is on the desk whenever you sit down.",
      intent: "mutate",
      citations,
      pendingActionIds: pending,
      memoryUpdates: remembered,
    };
  }

  const events = done.flatMap((item) => (item.name === "list_events" ? asArray(item.data.events) : []));
  const tasks = done.flatMap((item) => (item.name === "list_tasks" ? asArray(item.data.tasks) : []));
  const notes = done.flatMap((item) => (item.name === "search_notes" ? asArray(item.data.notes) : []));
  const wantsBrief = /\b(brief|on my plate|plan my day|what(?:'s| is) on)\b/i.test(text);

  if (wantsBrief || events.length || tasks.length) {
    const eventLines = events.length
      ? events.map((event) => `• ${String(event.when)} — ${String(event.title)}`).join("\n")
      : "• Nothing on the calendar in that window.";
    const taskLines = tasks.length
      ? tasks
          .map((task) => `• ${String(task.title)} (${String(task.priority)}${task.due ? `, due ${String(task.due)}` : ""})`)
          .join("\n")
      : "• No open tasks.";
    const preference = memories.find((memory) => /deep work|confirmation|short/i.test(memory));
    const dayLabel =
    /\btomorrow\b/i.test(text) && !/\btoday\b/i.test(text) ? "tomorrow" : zonedISODate(clock.now, clock.timeZone);
  const next = tasks[0] ? `Start with “${String(tasks[0].title)}”.` : "The calendar is the plan.";
    const waiting = pending.length ? `\n\n${pending.length} outbound draft${pending.length === 1 ? "" : "s"} still waiting.` : "";
    return {
      reply: `Here is the desk for ${dayLabel}.\n\nCalendar\n${eventLines}\n\nOpen tasks\n${taskLines}${preference ? `\n\nKept in mind: ${preference}` : ""}${waiting}\n\nNext step: ${next}`,
      intent: "brief",
      citations,
      pendingActionIds: pending,
      memoryUpdates: [],
    };
  }

  if (notes.length) {
    const lines = notes.map((note) => `• ${String(note.title)} — ${String(note.body)}`).join("\n");
    return {
      reply: `Notes that match:\n${lines}\n\nNext step: say if you want one of these turned into a task.`,
      intent: "recall",
      citations,
      pendingActionIds: [],
      memoryUpdates: [],
    };
  }

  if (memories.length && /\bremember\b/i.test(text)) {
    return {
      reply: `What I have that fits:\n${memories.map((memory) => `• ${memory}`).join("\n")}\n\nNext step: tell me if one of these should change.`,
      intent: "recall",
      citations,
      pendingActionIds: [],
      memoryUpdates: [],
    };
  }

  if (failed.length) {
    return {
      reply: `I couldn't do that cleanly (${failed.map((item) => item.summary).join("; ")}).\n\nNext step: rephrase the time or the title.`,
      intent: "chat",
      citations,
      pendingActionIds: [],
      memoryUpdates: [],
    };
  }

  return {
    reply:
      "I can read the day, add a task or a calendar block, save a note, remember a preference, or park an email for you to confirm.\n\nNext step: try “What's on my plate today?”",
    intent: "chat",
    citations: [],
    pendingActionIds: [],
    memoryUpdates: [],
  };
}

function describeMutation(item: ToolPayload, clock: Clock): string {
  if (item.name === "create_event") {
    const event = item.data.event as { title?: string; when?: string; start?: string; end?: string };
    const when =
      event.when ||
      (event.start && event.end ? formatRange(event.start, event.end, clock.timeZone, clock.now) : "on the calendar");
    return `I blocked “${event.title}” ${when}.`;
  }
  if (item.name === "create_task") {
    const task = item.data.task as { title?: string; due?: string | null };
    return `I added the task “${task.title}”${task.due ? ` due ${task.due}` : ""}.`;
  }
  if (item.name === "create_note") {
    const note = item.data.note as { title?: string };
    return `I saved the note “${note.title}”.`;
  }
  if (item.name === "remember") {
    const memory = item.data.memory as { text?: string };
    return `I'll remember: ${memory.text}`;
  }
  if (item.name === "complete_task") {
    const task = item.data.task as { title?: string };
    return `I marked “${task.title}” done.`;
  }
  return item.summary;
}

function citationsFrom(done: ToolPayload[]) {
  const citations: AssistantTurn["citations"] = [];
  for (const item of done) {
    for (const event of asArray(item.data.events)) pushCitation(citations, "event", event);
    if (item.data.event) pushCitation(citations, "event", item.data.event as Record<string, unknown>);
    for (const task of asArray(item.data.tasks)) pushCitation(citations, "task", task);
    if (item.data.task) pushCitation(citations, "task", item.data.task as Record<string, unknown>);
    for (const note of asArray(item.data.notes)) pushCitation(citations, "note", note);
    if (item.data.note) pushCitation(citations, "note", item.data.note as Record<string, unknown>);
    for (const memory of asArray(item.data.memories)) pushCitation(citations, "memory", memory);
    if (item.data.memory) pushCitation(citations, "memory", item.data.memory as Record<string, unknown>);
    for (const action of asArray(item.data.actions)) pushCitation(citations, "action", action);
    if (item.data.action) pushCitation(citations, "action", item.data.action as Record<string, unknown>);
  }
  return citations.slice(0, 12);
}

function pushCitation(
  citations: AssistantTurn["citations"],
  type: AssistantTurn["citations"][number]["type"],
  record: Record<string, unknown>,
) {
  const id = String(record.id ?? "");
  const label = String(record.title ?? record.text ?? record.subject ?? id);
  if (!id || citations.some((item) => item.id === id)) return;
  citations.push({ type, id, label });
}

function pendingIds(done: ToolPayload[]): string[] {
  return done.flatMap((item) => {
    const ids: string[] = [];
    const action = item.data.action as { id?: string; status?: string } | undefined;
    if (action?.status === "pending" && action.id) ids.push(action.id);
    for (const entry of asArray(item.data.actions)) {
      if (entry.status === "pending" && entry.id) ids.push(String(entry.id));
    }
    return ids;
  });
}

function memoriesFrom(done: ToolPayload[]): Memory[] {
  return done.flatMap((item) => asArray(item.data.memories) as unknown as Memory[]);
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export function parseInbound(text: string): { from: string; subject: string; body: string } | null {
  if (!text.startsWith("INBOUND")) return null;
  const from = text.match(/\bfrom=(\S+)/)?.[1];
  const subject = text.match(/^Subject:\s*(.+)$/m)?.[1]?.trim();
  const body = text.match(/^Body:\n([\s\S]*?)\nPlease draft/m)?.[1]?.trim();
  if (!from || !subject || !body) return null;
  return { from, subject, body };
}

export function inboundMessage(input: {
  source: string;
  type: string;
  from: string;
  subject: string;
  body: string;
}): string {
  return `INBOUND source=${input.source} type=${input.type} from=${input.from}\nSubject: ${input.subject}\nBody:\n${input.body.trim()}\nPlease draft a reply and park it for confirmation. Do not send it.`;
}

function extractTaskTitle(text: string): string | null {
  const match = text.match(/\b(?:add|create|make)\s+(?:a\s+)?task\s+(?:to\s+)?(.+?)(?:\.|$)/i);
  if (match) return stripTrailingAnd(match[1]);
  const remind = text.match(/\bremind me to\s+(.+?)(?:\.|$)/i);
  return remind ? stripTrailingAnd(remind[1]) : null;
}

function extractEventTitle(text: string): string | null {
  const match = text.match(/\b(?:block|schedule|book)\b[\s\S]*?\bfor\s+(?:the\s+)?(.+?)(?:\s+and\s+|\.|$)/i);
  return match ? clean(match[1]) : null;
}

function stripTrailingAnd(value: string): string {
  return clean(value.replace(/\s+and\s+(?:add|create|make|schedule|block)\b[\s\S]*$/i, ""));
}

function clean(value: string): string {
  return value.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string): string {
  const cleaned = clean(value);
  if (!cleaned) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function displayName(email: string): string {
  const local = email.split("@")[0]?.split(/[._-]/)[0] ?? "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function firstSentence(body: string): string {
  const sentence = body.replace(/\s+/g, " ").split(/(?<=\.)\s/)[0] ?? body;
  return sentence.trim();
}

