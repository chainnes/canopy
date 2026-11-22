import { timingSafeEqual } from "node:crypto";

export function tokensMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
