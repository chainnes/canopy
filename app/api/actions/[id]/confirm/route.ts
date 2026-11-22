import { jsonError } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { confirmAction } from "@/lib/service";

export async function POST(_request: Request, context: RouteContext<"/api/actions/[id]/confirm">) {
  try {
    const { id } = await context.params;
    const { store, config } = getRuntime();
    return Response.json(
      await confirmAction({
        store,
        id,
        config,
        outboundWebhookUrl: config.outboundWebhookUrl,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
