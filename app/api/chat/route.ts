import { jsonError } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { chatRequestSchema } from "@/lib/schema";
import { chat } from "@/lib/service";

export async function POST(request: Request) {
  try {
    const body = chatRequestSchema.parse(await request.json());
    const { store, provider, config } = getRuntime();
    return Response.json(await chat({ store, provider, config, message: body.message }));
  } catch (error) {
    return jsonError(error);
  }
}
