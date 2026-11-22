import { nextMockStep, type ToolPayload } from "@/lib/planner";
import { DeskError } from "@/lib/schema";
import { toolSpecs } from "@/lib/tools";

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ModelToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type LlmProvider = {
  name: "mock" | "openai";
  model: string;
  complete(input: { messages: ModelMessage[] }): Promise<{
    content: string | null;
    toolCalls: ModelToolCall[];
  }>;
};

export function createMockProvider(clock: { now: () => Date; timeZone: string }): LlmProvider {
  return {
    name: "mock",
    model: "mock-planner",
    async complete({ messages }) {
      const text = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
      const lastUser = messages.findLastIndex((message) => message.role === "user");
      const done: ToolPayload[] = messages.slice(lastUser + 1).flatMap((message) => {
        if (message.role !== "tool") return [];
        try {
          const parsed = JSON.parse(message.content) as ToolPayload;
          return [{ ...parsed, name: message.name }];
        } catch {
          return [];
        }
      });
      const step = nextMockStep(text, done, { now: clock.now(), timeZone: clock.timeZone });
      if (step.type === "tools") {
        return {
          content: null,
          toolCalls: step.calls.map((call, index) => ({
            id: `call_${done.length}_${index}_${call.name}`,
            name: call.name,
            arguments: call.args,
          })),
        };
      }
      return { content: JSON.stringify(step.turn), toolCalls: [] };
    },
  };
}

type OpenAIMessage = {
  role: string;
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
};

export function createOpenAIProvider(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): LlmProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    name: "openai",
    model: options.model,
    async complete({ messages }) {
      const apiKey = options.apiKey || localDefaultKey(options.baseUrl);
      if (!apiKey) {
        throw new DeskError(
          "LLM_API_KEY is empty. Set it, or switch LLM_PROVIDER=mock to run the demo offline. A local Ollama endpoint can use LLM_API_KEY=ollama.",
          400,
        );
      }
      const body = {
        model: options.model,
        temperature: 0.2,
        messages: messages.map(toOpenAI),
        tools: toolSpecs,
      };
      let response: Response;
      try {
        response = await fetchImpl(`${options.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new DeskError("The model endpoint could not be reached.", 502);
      }
      if (!response.ok) {
        throw new DeskError(`The model endpoint returned ${response.status}.`, 502);
      }
      const payload = (await response.json()) as {
        choices?: { message?: OpenAIMessage }[];
      };
      const message = payload.choices?.[0]?.message;
      if (!message) throw new DeskError("The model returned an empty choice.", 502);
      const toolCalls = (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: parseArgs(call.function.arguments),
      }));
      return { content: message.content, toolCalls };
    },
  };
}

function localDefaultKey(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname;
    if (host === "localhost" || host === "127.0.0.1") return "ollama";
  } catch {
    return "";
  }
  return "";
}

function toOpenAI(message: ModelMessage): OpenAIMessage {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
      name: message.name,
    };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The tool layer reports invalid arguments; don't throw the whole turn away.
  }
  return {};
}
