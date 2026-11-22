import { jsonError, requireTriggerToken } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { inboundSchema } from "@/lib/schema";
import { ingestInbound } from "@/lib/service";

export async function POST(request: Request) {
  try {
    const { store, provider, config } = getRuntime();
    requireTriggerToken(request, config);
    const payload = inboundSchema.parse(await request.json());
    return Response.json(await ingestInbound({ store, provider, config, payload }));
  } catch (error) {
    return jsonError(error);
  }
}
