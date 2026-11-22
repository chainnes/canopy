const base = process.env.CANOPY_URL ?? "http://127.0.0.1:3847";
const token = process.env.TRIGGER_TOKEN ?? "dev-trigger-token";

async function request(path, init) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${path} ${response.status}: ${body.error ?? "request failed"}`);
  }
  return body;
}

const health = await request("/api/health");
console.log(`health  provider=${health.provider} model=${health.model}`);

const chat = await request("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message: "What's on my plate today?" }),
});
const last = chat.messages.at(-1);
console.log(`brief   ${last.content.split("\n")[0]}`);

const hook = await request("/api/webhooks/inbound", {
  method: "POST",
  headers: { "content-type": "application/json", "x-trigger-token": token },
  body: JSON.stringify({
    source: "chainnes.com",
    type: "inquiry",
    from: "maya@example.com",
    subject: "Saturday sensor-walk workshop",
    body: "Could you lead a Saturday morning walk for about eight neighbors?",
  }),
});
console.log(`webhook pending=${hook.pendingActionId}`);

const confirmed = await request(`/api/actions/${hook.pendingActionId}/confirm`, { method: "POST" });
const action = confirmed.actions.find((item) => item.id === hook.pendingActionId);
console.log(`confirm ${action.status} · ${action.deliveryDetail}`);
