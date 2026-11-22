import { ZodError } from "zod";
import type { AppConfig } from "@/lib/config";
import { DeskError } from "@/lib/schema";
import { tokensMatch } from "@/lib/tokens";

export function jsonError(error: unknown): Response {
  if (error instanceof DeskError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "That request didn't match the expected shape.",
        issues: error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }
  console.error(error);
  return Response.json({ error: "The desk hit an unexpected error." }, { status: 500 });
}

export function requireTriggerToken(request: Request, config: AppConfig): void {
  if (!config.triggerToken) {
    throw new DeskError("TRIGGER_TOKEN is not set, so this endpoint is closed.", 503);
  }
  const provided = request.headers.get("x-trigger-token");
  if (!tokensMatch(provided, config.triggerToken)) {
    throw new DeskError("The trigger token did not match.", 401);
  }
}

export function requireDemo(config: AppConfig): void {
  if (!config.demoUi) {
    throw new DeskError("Demo controls are off. Set DEMO_UI=true only on a machine you trust.", 403);
  }
}
