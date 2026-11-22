import { describe, expect, it } from "vitest";
import { DeskError } from "@/lib/schema";
import { SAMPLE_INQUIRY } from "@/lib/seed";
import { confirmAction, ingestInbound, rejectAction } from "@/lib/service";
import { executeTool } from "@/lib/tools";
import { tokensMatch } from "@/lib/tokens";
import { NOW, deskFixture } from "./helpers";

describe("confirmation gate", () => {
  it("parks a draft and does not send it", async () => {
    const { store, provider, config } = deskFixture();
    const view = await ingestInbound({
      store,
      provider,
      config,
      now: NOW,
      payload: SAMPLE_INQUIRY,
    });
    expect(view.pendingActionId).toBeTruthy();
    const action = store.read().actions.find((item) => item.id === view.pendingActionId);
    expect(action?.status).toBe("pending");
    expect(action?.to).toBe("maya@example.com");
    expect(action?.delivery).toBeNull();
    expect(action?.body).toContain("Webhook router quote");
  });

  it("sends only after confirm, and only once", async () => {
    const { store, provider, config } = deskFixture();
    const parked = await ingestInbound({
      store,
      provider,
      config,
      now: NOW,
      payload: SAMPLE_INQUIRY,
    });
    const id = parked.pendingActionId!;
    const sent = await confirmAction({
      store,
      id,
      now: NOW,
      config,
      outboundWebhookUrl: "",
    });
    const action = sent.actions.find((item) => item.id === id);
    expect(action?.status).toBe("sent");
    expect(action?.delivery).toBe("simulated");
    expect(action?.deliveryDetail).toContain("nothing left the machine");
    await expect(
      confirmAction({ store, id, now: NOW, config, outboundWebhookUrl: "" }),
    ).rejects.toBeInstanceOf(DeskError);
  });

  it("reject leaves the draft unsent", async () => {
    const { store, provider, config } = deskFixture();
    const parked = await ingestInbound({
      store,
      provider,
      config,
      now: NOW,
      payload: SAMPLE_INQUIRY,
    });
    const view = await rejectAction({
      store,
      id: parked.pendingActionId!,
      now: NOW,
      config,
    });
    const action = view.actions.find((item) => item.id === parked.pendingActionId);
    expect(action?.status).toBe("rejected");
    expect(action?.delivery).toBeNull();
  });

  it("keeps a webhook pending when delivery fails", async () => {
    const { store, config } = deskFixture();
    await store.transact((state) => {
      executeTool(
        state,
        "draft_outbound",
        {
          channel: "webhook",
          to: "https://example.test/hook",
          subject: "Ping",
          body: "hello",
          reason: "test",
        },
        { now: NOW, timeZone: config.timeZone },
      );
    });
    const id = store.read().actions[0]!.id;
    const fetchImpl = (async () => new Response("no", { status: 500 })) as typeof fetch;
    await expect(
      confirmAction({
        store,
        id,
        now: NOW,
        config,
        outboundWebhookUrl: "https://example.test/hook",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(DeskError);
    expect(store.read().actions[0]?.status).toBe("pending");
  });

  it("compares trigger tokens without treating a prefix as a match", () => {
    expect(tokensMatch("dev-trigger-token", "dev-trigger-token")).toBe(true);
    expect(tokensMatch("dev-trigger-token-extra", "dev-trigger-token")).toBe(false);
    expect(tokensMatch("", "dev-trigger-token")).toBe(false);
  });
});
