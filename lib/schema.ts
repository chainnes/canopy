import { z } from "zod";
import { assessmentSchema } from "@/lib/assess";

export const citationSchema = z.object({
  type: z.enum(["event", "task", "note", "memory", "action", "profile", "job", "web"]),
  id: z.string().min(1),
  label: z.string().min(1),
});

export const planSchema = z.object({
  steps: z.array(z.string().min(1)).min(1).max(8),
});

export const assistantTurnSchema = z
  .object({
    reply: z.string().trim().min(1),
    intent: z.enum(["brief", "mutate", "recall", "draft", "chat", "assess"]),
    citations: z.array(citationSchema).optional().default([]),
    pendingActionIds: z.array(z.string()).optional().default([]),
    memoryUpdates: z.array(z.string()).optional().default([]),
    plan: planSchema.nullable().optional(),
    assessment: assessmentSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.intent === "assess" && !value.assessment) {
      ctx.addIssue({
        code: "custom",
        message: "assess intent requires an assessment object",
        path: ["assessment"],
      });
    }
  });

export type AssistantTurn = z.infer<typeof assistantTurnSchema>;
export type Citation = z.infer<typeof citationSchema>;

export const inboundSchema = z.object({
  source: z.string().trim().min(1).max(120),
  type: z.string().trim().min(1).max(80),
  from: z.email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
});

export type InboundPayload = z.infer<typeof inboundSchema>;

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The model did not return a JSON object.");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export function formatSchemaError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

export function parseAssistantTurn(text: string): AssistantTurn {
  return assistantTurnSchema.parse(extractJsonObject(text));
}

export class DeskError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DeskError";
    this.status = status;
  }
}
