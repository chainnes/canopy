export type ProviderName = "mock" | "openai";

export type AppConfig = {
  provider: ProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  triggerToken: string;
  outboundWebhookUrl: string;
  morningBriefHour: number;
  timeZone: string;
  dataPath: string;
  demoUi: boolean;
  schedulerEnabled: boolean;
  embeddingProvider: "local" | "openai";
  embeddingModel: string;
};

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const provider = (env.LLM_PROVIDER || "mock").trim().toLowerCase();
  if (provider !== "mock" && provider !== "openai") {
    throw new Error(`LLM_PROVIDER must be "mock" or "openai" (got ${provider}).`);
  }
  const embeddingProvider = (env.EMBEDDING_PROVIDER || "local").trim().toLowerCase();
  if (embeddingProvider !== "local" && embeddingProvider !== "openai") {
    throw new Error(`EMBEDDING_PROVIDER must be "local" or "openai" (got ${embeddingProvider}).`);
  }
  const hour = Number(env.MORNING_BRIEF_HOUR ?? "8");
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("MORNING_BRIEF_HOUR must be an integer from 0 to 23.");
  }
  return {
    provider,
    baseUrl: (env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey: env.LLM_API_KEY || "",
    model: env.LLM_MODEL || (provider === "mock" ? "mock-planner" : "gpt-4o-mini"),
    triggerToken:
      env.TRIGGER_TOKEN && env.TRIGGER_TOKEN.trim()
        ? env.TRIGGER_TOKEN.trim()
        : env.NODE_ENV === "production"
          ? ""
          : "dev-trigger-token",
    outboundWebhookUrl: env.OUTBOUND_WEBHOOK_URL || "",
    morningBriefHour: hour,
    timeZone: env.APP_TIMEZONE || "Asia/Manila",
    dataPath: env.DATA_PATH || "./data/canopy.json",
    demoUi: flag(env.DEMO_UI, true),
    schedulerEnabled: flag(env.SCHEDULER_ENABLED, false),
    embeddingProvider,
    embeddingModel: env.EMBEDDING_MODEL || "local-hash-v1",
  };
}
