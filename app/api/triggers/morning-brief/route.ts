import { jsonError, requireTriggerToken } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { runMorningBrief } from "@/lib/service";

export async function POST(request: Request) {
  try {
    const { store, provider, config } = getRuntime();
    requireTriggerToken(request, config);
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    return Response.json(
      await runMorningBrief({ store, provider, config, source: "schedule", force }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
