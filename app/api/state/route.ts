import { connection } from "next/server";
import { jsonError } from "@/lib/http";
import { getRuntime } from "@/lib/runtime";
import { present } from "@/lib/service";

export async function GET() {
  await connection();
  try {
    const { store, config } = getRuntime();
    return Response.json(present(store.read(), config));
  } catch (error) {
    return jsonError(error);
  }
}
