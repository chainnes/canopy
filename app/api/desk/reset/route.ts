import { jsonError, requireDemo } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { resetDesk } from "@/lib/service";

export async function POST() {
  try {
    const { store, config } = getRuntime();
    requireDemo(config);
    return Response.json(await resetDesk(store, config));
  } catch (error) {
    return jsonError(error);
  }
}
