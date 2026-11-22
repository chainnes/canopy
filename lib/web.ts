import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type WebSnippet = {
  title: string;
  url: string;
  snippet: string;
};

type Fixture = {
  query: string;
  results: WebSnippet[];
};

let cache: Fixture[] | null = null;

function loadFixtures(): Fixture[] {
  if (cache) return cache;
  const dir = join(process.cwd(), "fixtures", "web");
  try {
    cache = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as Fixture);
  } catch {
    cache = [];
  }
  return cache;
}

/** Offline stand-in for web research. Missing fixtures mean the claim is not web-verified. */
export function searchWebFixtures(query: string): WebSnippet[] {
  const needle = query.toLowerCase();
  return loadFixtures()
    .filter((fixture) => needle.includes(fixture.query) || fixture.query.includes(needle))
    .flatMap((fixture) => fixture.results);
}
