import { describe, expect, it } from "vitest";
import { cosine, localEmbed, remoteEmbed } from "@/lib/embeddings";
import { searchChunks } from "@/lib/rag";
import { NOW, TZ, deskFixture } from "./helpers";

describe("local embeddings", () => {
  it("is deterministic and ranks a related note above an unrelated one", () => {
    const { store } = deskFixture();
    const state = store.read();
    const harbor = localEmbed("Postgres warehouse counts posted to a webhook");
    expect(localEmbed("Postgres warehouse counts posted to a webhook")).toEqual(harbor);
    expect(cosine(harbor, harbor)).toBeCloseTo(1, 5);
    const hits = searchChunks(state.chunks, "Postgres warehouse webhook Harbor Ledger", 4);
    expect(hits[0]?.chunk.sourceId === "prof_harbor" || hits[0]?.chunk.title.toLowerCase().includes("harbor")).toBe(
      true,
    );
    const unrelated = cosine(harbor, localEmbed("Friday afternoon writing practice with no databases"));
    expect(hits[0]!.score).toBeGreaterThan(unrelated);
  });

  it("accepts an OpenAI-compatible embeddings payload", async () => {
    const vectors = await remoteEmbed(["harbor ledger"], {
      baseUrl: "http://embeddings.test/v1",
      apiKey: "test",
      model: "fixture",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({ data: [{ index: 0, embedding: [3, 0, 4] }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as typeof fetch,
    });
    expect(vectors[0]?.[0]).toBeCloseTo(0.6, 5);
    expect(vectors[0]?.[2]).toBeCloseTo(0.8, 5);
  });
});

describe("semantic recall", () => {
  it("finds a newly remembered Friday preference", async () => {
    const { store, provider } = deskFixture();
    const { runTurn } = await import("@/lib/agent");
    await runTurn({
      store,
      provider,
      message: "Remember that I protect Friday afternoons for writing.",
      now: NOW,
      timeZone: TZ,
    });
    const reply = await runTurn({
      store,
      provider,
      message: "What do you remember about Friday?",
      now: NOW,
      timeZone: TZ,
    });
    expect(reply.content).toContain("Friday afternoons");
  });
});
