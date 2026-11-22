import { loadConfig, type AppConfig } from "@/lib/config";
import { LOCAL_EMBEDDING_MODEL } from "@/lib/embeddings";
import { providerFromConfig } from "@/lib/provider-factory";
import { buildSeed } from "@/lib/seed";
import { Store } from "@/lib/store";

type RuntimeGlobal = typeof globalThis & {
  canopyStore?: Store;
  canopyStorePath?: string;
};

function globals(): RuntimeGlobal {
  return globalThis as RuntimeGlobal;
}

export function getRuntime() {
  const config = loadConfig();
  const g = globals();
  if (!g.canopyStore || g.canopyStorePath !== config.dataPath) {
    const store = new Store(config.dataPath);
    if (!store.exists()) {
      store.write(buildSeed(new Date(), config.timeZone));
    } else {
      const state = store.read();
      const current = state.chunks.some((chunk) => chunk.sourceId === "prof_bio");
      if (!current || state.embeddingModel !== LOCAL_EMBEDDING_MODEL) {
        store.write(buildSeed(new Date(), config.timeZone));
      }
    }
    g.canopyStore = store;
    g.canopyStorePath = config.dataPath;
  }
  return {
    config,
    store: g.canopyStore,
    provider: providerFromConfig(config),
  };
}

export function providerFor(config: AppConfig) {
  return providerFromConfig(config);
}
