import { jsonError } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { rejectAction } from "@/lib/service";

export async function POST(_request: Request, context: RouteContext<"/api/actions/[id]/reject">) {
  try {
    const { id } = await context.params;
    const { store, config } = getRuntime();
    return Response.json(await rejectAction({ store, id, config }));
  } catch (error) {
    return jsonError(error);
  }
}
