import { connection } from "next/server";
import { jsonError } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";

export async function GET() {
  await connection();
  try {
    const { config } = getRuntime();
    return Response.json({
      ok: true,
      provider: config.provider,
      model: config.model,
      embedding: config.embeddingProvider === "local" ? "local-hash-v1" : config.embeddingModel,
      timeZone: config.timeZone,
    });
  } catch (error) {
    return jsonError(error);
  }
}
