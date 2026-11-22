import { describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent";
import { nextMockStep } from "@/lib/planner";
import { parseAssistantTurn } from "@/lib/schema";
import { toolSpecs } from "@/lib/tools";
import { NOW, TZ, deskFixture } from "./helpers";

const block =
  "Block 90 minutes tomorrow morning for the ESP32 writeup and add a task to draft the sensor notes.";

describe("mock planner", () => {
  it("plans a read-only brief", () => {
    const step = nextMockStep("What's on my plate today?", [], { now: NOW, timeZone: TZ });
    expect(step.type).toBe("tools");
    if (step.type !== "tools") return;
    expect(step.calls.map((call) => call.name)).toEqual([
      "list_events",
      "list_tasks",
      "recall_memory",
      "list_pending",
    ]);
  });

  it("plans the calendar block and the task together", () => {
    const step = nextMockStep(block, [], { now: NOW, timeZone: TZ });
    expect(step.type).toBe("tools");
    if (step.type !== "tools") return;
    expect(step.calls.map((call) => call.name)).toEqual(["create_event", "create_task"]);
    expect(step.calls[0]?.args).toMatchObject({
      title: "ESP32 writeup",
      start: "2026-11-16T01:00:00.000Z",
      end: "2026-11-16T02:30:00.000Z",
    });
    expect(step.calls[1]?.args).toMatchObject({
      title: "Draft the sensor notes",
      due: null,
    });
  });
});

describe("agent turns", () => {
  it("briefs from the desk instead of inventing a meeting", async () => {
    const { store, provider } = deskFixture();
    const reply = await runTurn({
      store,
      provider,
      message: "What's on my plate today?",
      now: NOW,
      timeZone: TZ,
    });
    expect(reply.content).toContain("Deep work: harbor ledger case study");
    expect(reply.content).toContain("Outline the harbor ledger case study");
    expect(reply.content.toLowerCase()).not.toContain("board meeting");
    expect(reply.traces?.map((trace) => trace.name)).toContain("list_events");
    expect(store.read().actions).toHaveLength(0);
  });

  it("writes the block and the task, then says so", async () => {
    const { store, provider } = deskFixture();
    const reply = await runTurn({
      store,
      provider,
      message: block,
      now: NOW,
      timeZone: TZ,
    });
    const state = store.read();
    expect(state.events.some((event) => event.title === "ESP32 writeup")).toBe(true);
    expect(state.tasks.some((task) => task.title === "Draft the sensor notes")).toBe(true);
    expect(reply.content).toContain("ESP32 writeup");
    expect(reply.content).toContain("Draft the sensor notes");
    expect(reply.intent).toBe("mutate");
  });

  it("remembers a preference and can recall it", async () => {
    const { store, provider } = deskFixture();
    await runTurn({
      store,
      provider,
      message: "Remember that I protect Friday afternoons for music.",
      now: NOW,
      timeZone: TZ,
    });
    const saved = store.read().memories.find((memory) => memory.text.includes("Friday afternoons"));
    expect(saved?.kind).toBe("preference");
    const reply = await runTurn({
      store,
      provider,
      message: "What do you remember about Friday?",
      now: NOW,
      timeZone: TZ,
    });
    expect(reply.content).toContain("Friday afternoons");
  });

  it("rejects a model reply that is not the schema", () => {
    expect(() => parseAssistantTurn("sure, I sent that email")).toThrow();
    const turn = parseAssistantTurn('```json\n{"reply":"Parked.","intent":"draft"}\n```');
    expect(turn.reply).toBe("Parked.");
    expect(turn.pendingActionIds).toEqual([]);
  });

  it("does not offer a send tool", () => {
    const names = toolSpecs.map((tool) => tool.function.name);
    expect(names).toContain("draft_outbound");
    expect(names).toContain("assess_jobs");
    expect(names).not.toContain("send");
    expect(names).not.toContain("submit");
    expect(names).not.toContain("login");
    expect(names).not.toContain("confirm");
  });
});
