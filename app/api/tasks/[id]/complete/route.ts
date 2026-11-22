import { jsonError } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { completeTask } from "@/lib/service";

export async function POST(_request: Request, context: RouteContext<"/api/tasks/[id]/complete">) {
  try {
    const { id } = await context.params;
    const { store, config } = getRuntime();
    return Response.json(await completeTask({ store, id, config }));
  } catch (error) {
    return jsonError(error);
  }
}
