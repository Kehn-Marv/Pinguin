import { Ollama } from "ollama";
import { getOllamaHost } from "../ollama";
import { getEmbeddingsModel } from "../model";
import EmbeddingCache from "./embeddingCache";
import logger from "electron-log";

/**
 * Progress callback for embedding operations
 */
export type EmbeddingProgressCallback = (completed: number, total: number) => void;

/**
 * Optimized embedding functions with caching and batching
 */

/**
 * Embeds a single text chunk (with caching)
 * @param text - Text to embed
 * @returns Embedding vector
 */
export const embed = async (text: string): Promise<number[]> => {
  const cache = EmbeddingCache.getInstance();
  
  // Check cache first
  const cached = cache.get(text);
  if (cached) {
    return cached;
  }
  
  // Generate new embedding
  const ollama = new Ollama({ host: getOllamaHost() });
  const model = await getEmbeddingsModel();
  if (!model) {
    throw new Error("No embeddings model configured");
  }
  const response = await ollama.embeddings({ model, prompt: text });
  
  // Cache the result
  cache.set(text, response.embedding);
  
  return response.embedding;
};

/**
 * Embeds multiple text chunks in optimized parallel batches
 * @param texts - Array of text chunks to embed
 * @param progressCallback - Optional callback for progress updates
 * @param batchSize - Number of chunks to process in parallel (default: 20)
 * @returns Array of embedding vectors
 */
export const embedBatch = async (
  texts: string[],
  progressCallback?: EmbeddingProgressCallback,
  batchSize = 20
): Promise<number[][]> => {
  const cache = EmbeddingCache.getInstance();
  const embeddings: number[][] = [];
  const textsToEmbed: { index: number; text: string }[] = [];
  
  // Check cache for all texts first
  let cacheHits = 0;
  for (let i = 0; i < texts.length; i++) {
    const cached = cache.get(texts[i]);
    if (cached) {
      embeddings[i] = cached;
      cacheHits++;
    } else {
      textsToEmbed.push({ index: i, text: texts[i] });
    }
  }
  
  if (cacheHits > 0) {
    logger.info(`Embedding cache hits: ${cacheHits}/${texts.length} (${Math.round(cacheHits / texts.length * 100)}%)`);
  }
  
  // If all texts are cached, return immediately
  if (textsToEmbed.length === 0) {
    if (progressCallback) {
      progressCallback(texts.length, texts.length);
    }
    return embeddings;
  }
  
  // Process uncached texts in parallel batches
  const ollama = new Ollama({ host: getOllamaHost() });
  const model = await getEmbeddingsModel();
  if (!model) {
    throw new Error("No embeddings model configured");
  }
  
  let completed = cacheHits;
  
  for (let i = 0; i < textsToEmbed.length; i += batchSize) {
    const batch = textsToEmbed.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchEmbeddings = await Promise.all(
      batch.map(async ({ text }) => {
        const response = await ollama.embeddings({ model, prompt: text });
        return response.embedding;
      })
    );
    
    // Store results and cache them
    batch.forEach(({ index, text }, batchIndex) => {
      const embedding = batchEmbeddings[batchIndex];
      embeddings[index] = embedding;
      cache.set(text, embedding);
    });
    
    // Update progress
    completed += batch.length;
    if (progressCallback) {
      progressCallback(completed, texts.length);
    }
  }
  
  return embeddings;
};

/**
 * Embeds text chunks with progress tracking and optimized batching
 * This is the recommended function for embedding large numbers of chunks
 * @param texts - Array of text chunks to embed
 * @param progressCallback - Callback for progress updates
 * @returns Array of embedding vectors
 */
export const embedWithProgress = async (
  texts: string[],
  progressCallback: EmbeddingProgressCallback
): Promise<number[][]> => {
  return embedBatch(texts, progressCallback, 20);
};
