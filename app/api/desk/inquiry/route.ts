import { jsonError, requireDemo } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { inboundSchema } from "@/lib/schema";
import { SAMPLE_INQUIRY } from "@/lib/seed";
import { ingestInbound } from "@/lib/service";

export async function POST() {
  try {
    const { store, provider, config } = getRuntime();
    requireDemo(config);
    const payload = inboundSchema.parse(SAMPLE_INQUIRY);
    return Response.json(await ingestInbound({ store, provider, config, payload }));
  } catch (error) {
    return jsonError(error);
  }
}
