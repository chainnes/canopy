/** Feature-hashing embedder. Deterministic, local, and comparable with cosine similarity. */

export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";
export const EMBEDDING_DIM = 128;

function fnv(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

export function localEmbed(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const hash = fnv(token);
    for (let lane = 0; lane < 4; lane += 1) {
      const dimension = (hash + lane * 17) % EMBEDDING_DIM;
      const sign = (hash >> (lane + 1)) & 1 ? 1 : -1;
      vector[dimension] += sign * (1 + Math.min(token.length, 12) / 12);
    }
  }
  const compact = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (let index = 0; index < compact.length - 2; index += 1) {
    const gram = compact.slice(index, index + 3);
    const hash = fnv(gram);
    const dimension = hash % EMBEDDING_DIM;
    const sign = hash & 1 ? 1 : -1;
    vector[dimension] += sign * 0.35;
  }
  return normalize(vector);
}

export function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;
  return vector.map((value) => value / norm);
}

export function cosine(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) dot += left[index]! * right[index]!;
  return dot;
}

export async function remoteEmbed(
  texts: string[],
  options: { baseUrl: string; apiKey: string; model: string; fetchImpl?: typeof fetch },
): Promise<number[][]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: options.model, input: texts }),
  });
  if (!response.ok) {
    throw new Error(`Embedding endpoint returned ${response.status}.`);
  }
  const payload = (await response.json()) as {
    data?: { index: number; embedding: number[] }[];
  };
  const rows = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
  if (rows.length !== texts.length) {
    throw new Error("Embedding endpoint returned the wrong number of vectors.");
  }
  return rows.map((row) => normalize(row.embedding));
}
