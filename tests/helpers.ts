import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type AppConfig } from "@/lib/config";
import { createMockProvider, type LlmProvider } from "@/lib/provider";
import { buildSeed } from "@/lib/seed";
import { Store } from "@/lib/store";

export const NOW = new Date("2026-11-15T02:00:00.000Z");
export const TZ = "Asia/Manila";

export function deskFixture(): { store: Store; provider: LlmProvider; config: AppConfig } {
  const dir = mkdtempSync(join(tmpdir(), "canopy-"));
  const store = new Store(join(dir, "canopy.json"));
  store.write(buildSeed(NOW, TZ));
  const provider = createMockProvider({ now: () => NOW, timeZone: TZ });
  const config = loadConfig({
    LLM_PROVIDER: "mock",
    LLM_MODEL: "mock-planner",
    TRIGGER_TOKEN: "dev-trigger-token",
    APP_TIMEZONE: TZ,
    DATA_PATH: store.file,
    DEMO_UI: "true",
    SCHEDULER_ENABLED: "false",
    MORNING_BRIEF_HOUR: "8",
    OUTBOUND_WEBHOOK_URL: "",
  });
  return { store, provider, config };
}
