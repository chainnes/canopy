import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { runTurn } from "@/lib/agent";
import { createOpenAIProvider, type LlmProvider } from "@/lib/provider";
import { NOW, TZ, deskFixture } from "./helpers";

function scripted(replies: { content: string | null; toolCalls?: LlmProvider extends never ? never : [] }[]): LlmProvider {
  let index = 0;
  return {
    name: "openai",
    model: "scripted",
    async complete() {
      const reply = replies[Math.min(index, replies.length - 1)]!;
      index += 1;
      return { content: reply.content, toolCalls: [] };
    },
  };
}

describe("schema repair", () => {
  it("repairs once and then accepts a valid turn", async () => {
    const { store } = deskFixture();
    const provider = scripted([
      { content: "I already submitted the application." },
      { content: JSON.stringify({ reply: "Parked for you.", intent: "chat" }) },
    ]);
    const reply = await runTurn({
      store,
      provider,
      message: "Hello",
      now: NOW,
      timeZone: TZ,
    });
    expect(reply.content).toBe("Parked for you.");
    expect(store.read().reviewQueue).toHaveLength(0);
    expect(reply.content.toLowerCase()).not.toContain("submitted");
  });

  it("queues a second off-schema reply instead of guessing", async () => {
    const { store } = deskFixture();
    const provider = scripted([
      { content: "Sure, sent." },
      { content: "Still not json, and I sent it anyway." },
    ]);
    const reply = await runTurn({
      store,
      provider,
      message: "Hello",
      now: NOW,
      timeZone: TZ,
    });
    expect(reply.content).toContain("review queue");
    expect(reply.content.toLowerCase()).not.toContain("sent it anyway");
    const item = store.read().reviewQueue[0];
    expect(item?.reason.startsWith("model_output_off_schema:")).toBe(true);
    expect(item?.status).toBe("open");
    expect(store.read().actions.filter((action) => action.status === "sent")).toHaveLength(0);
  });
});

describe("OpenAI-compatible fixture", () => {
  it("reads a recorded chat completion over HTTP and runs the tool", async () => {
    const responses = [
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_assess",
                  type: "function",
                  function: { name: "assess_jobs", arguments: JSON.stringify({ ids: ["job_harbor", "job_crypto"] }) },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
            },
          },
        ],
      },
    ];
    let calls = 0;
    const server = createServer((request, response) => {
      expect(request.url).toBe("/v1/chat/completions");
      const payload = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    try {
      const provider = createOpenAIProvider({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        apiKey: "fixture",
        model: "recorded-fixture",
      });
      const first = await provider.complete({
        messages: [{ role: "user", content: "Assess the shortlist." }],
      });
      expect(first.toolCalls[0]?.name).toBe("assess_jobs");
      expect(first.toolCalls[0]?.arguments).toEqual({ ids: ["job_harbor", "job_crypto"] });
      expect(calls).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
