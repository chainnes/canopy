import { LOCAL_EMBEDDING_MODEL, cosine, localEmbed } from "@/lib/embeddings";
import { PROFILE } from "@/lib/profile";
import type { Chunk, DeskState } from "@/lib/store";

export function reindex(state: DeskState): void {
  const pieces: Omit<Chunk, "id" | "embedding">[] = [
    ...PROFILE.chunks.map((chunk) => ({
      source: "profile" as const,
      sourceId: chunk.id,
      title: chunk.title,
      text: chunk.text,
    })),
    ...state.notes.map((note) => ({
      source: "note" as const,
      sourceId: note.id,
      title: note.title,
      text: `${note.title}\n${note.body}`,
    })),
    ...state.memories.map((memory) => ({
      source: "memory" as const,
      sourceId: memory.id,
      title: memory.kind,
      text: memory.text,
    })),
  ];
  state.chunks = pieces.map((piece) => ({
    id: `chk_${piece.sourceId}`,
    ...piece,
    embedding: localEmbed(`${piece.title}\n${piece.text}`),
  }));
  state.embeddingModel = LOCAL_EMBEDDING_MODEL;
}

export function ensureIndex(state: DeskState): void {
  if (state.embeddingModel !== LOCAL_EMBEDDING_MODEL || state.chunks.length === 0) reindex(state);
}

export function searchChunks(
  chunks: Chunk[],
  query: string,
  limit = 4,
): { chunk: Chunk; score: number }[] {
  const queryVector = localEmbed(query);
  return chunks
    .map((chunk) => ({ chunk, score: cosine(queryVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0.05)
    .slice(0, limit);
}
