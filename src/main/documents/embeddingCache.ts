import crypto from "crypto";
import logger from "electron-log";

/**
 * EmbeddingCache provides a memory cache for embeddings to avoid re-processing identical chunks
 */
class EmbeddingCache {
  private static instance: EmbeddingCache | null = null;
  private cache: Map<string, number[]> = new Map();
  private readonly MAX_CACHE_SIZE = 1000; // Store up to 1000 embeddings

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): EmbeddingCache {
    if (!EmbeddingCache.instance) {
      EmbeddingCache.instance = new EmbeddingCache();
    }
    return EmbeddingCache.instance;
  }

  /**
   * Generates a hash key for a text chunk
   * @param text - Text to hash
   * @returns Hash key
   */
  private generateKey(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex");
  }

  /**
   * Gets embedding from cache if available
   * @param text - Text chunk
   * @returns Cached embedding or undefined
   */
  public get(text: string): number[] | undefined {
    const key = this.generateKey(text);
    return this.cache.get(key);
  }

  /**
   * Stores embedding in cache
   * @param text - Text chunk
   * @param embedding - Embedding vector
   */
  public set(text: string, embedding: number[]): void {
    const key = this.generateKey(text);
    
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, embedding);
  }

  /**
   * Checks if embedding exists in cache
   * @param text - Text chunk
   * @returns True if cached
   */
  public has(text: string): boolean {
    const key = this.generateKey(text);
    return this.cache.has(key);
  }

  /**
   * Gets cache statistics
   * @returns Cache stats
   */
  public getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }

  /**
   * Clears the cache
   */
  public clear(): void {
    logger.info("Clearing embedding cache");
    this.cache.clear();
  }
}

export default EmbeddingCache;
