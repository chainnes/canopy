import type { AppConfig } from "@/lib/config";
import { createMockProvider, createOpenAIProvider, type LlmProvider } from "@/lib/provider";

export function providerFromConfig(
  config: AppConfig,
  now: () => Date = () => new Date(),
): LlmProvider {
  if (config.provider === "mock") {
    return createMockProvider({ now, timeZone: config.timeZone });
  }
  return createOpenAIProvider({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  });
}
