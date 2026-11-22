import { loadConfig } from "@/lib/config";
import { getRuntime } from "@/lib/runtime";
import { runMorningBrief, shouldRunMorningBrief } from "@/lib/service";

type SchedulerGlobal = typeof globalThis & { canopyScheduler?: boolean };

let running = false;

export function startScheduler(): void {
  const config = loadConfig();
  if (!config.schedulerEnabled) return;
  const g = globalThis as SchedulerGlobal;
  if (g.canopyScheduler) return;
  g.canopyScheduler = true;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const runtime = getRuntime();
      const state = runtime.store.read();
      const now = new Date();
      if (
        shouldRunMorningBrief({
          now,
          timeZone: runtime.config.timeZone,
          hour: runtime.config.morningBriefHour,
          lastBriefDate: state.lastBriefDate,
        })
      ) {
        await runMorningBrief({
          store: runtime.store,
          provider: runtime.provider,
          config: runtime.config,
          now,
          source: "schedule",
        });
      }
    } catch (error) {
      console.error("Canopy morning brief failed.", error);
    } finally {
      running = false;
    }
  };

  setInterval(() => {
    void tick();
  }, 60_000);
  void tick();
}
