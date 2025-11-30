import Logger from "electron-log";

/**
 * ResourceManager - Manages memory and resource efficiency
 * 
 * Features:
 * - Memory monitoring and cleanup
 * - Message cache with size limit (10 chats max)
 * - Lazy loading support for chat messages
 * - Resource release after operations
 */
class ResourceManager {
  private static instance: ResourceManager | null = null;
  private messageCache: Map<string, Message[]> = new Map();
  private readonly MAX_CACHE_SIZE = 10;
  private readonly INITIAL_MESSAGE_LOAD = 50;

  private constructor() {
    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  public static getInstance(): ResourceManager {
    if (!this.instance) {
      this.instance = new ResourceManager();
    }
    return this.instance;
  }

  /**
   * Monitors memory usage and triggers cleanup if needed
   */
  private startMemoryMonitoring(): void {
    // Check memory every 30 seconds
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      
      Logger.info(`Memory usage: ${heapUsedMB} MB`);
      
      // If heap usage exceeds 200MB, trigger cleanup
      if (heapUsedMB > 200) {
        Logger.warn(`High memory usage detected: ${heapUsedMB} MB. Triggering cleanup...`);
        this.performMemoryCleanup();
      }
    }, 30000);
  }

  /**
   * Performs memory cleanup by clearing old cache entries
   */
  private performMemoryCleanup(): void {
    // Clear message cache
    this.messageCache.clear();
    Logger.info("Message cache cleared");
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      Logger.info("Garbage collection triggered");
    }
  }

  /**
   * Gets messages from cache or returns null if not cached
   */
  public getCachedMessages(courseId: string, chatId: string): Message[] | null {
    const key = this.createCacheKey(courseId, chatId);
    return this.messageCache.get(key) || null;
  }

  /**
   * Caches messages for a chat with size limit enforcement
   */
  public cacheMessages(courseId: string, chatId: string, messages: Message[]): void {
    const key = this.createCacheKey(courseId, chatId);
    
    // If cache is at max size, remove oldest entry
    if (this.messageCache.size >= this.MAX_CACHE_SIZE && !this.messageCache.has(key)) {
      const oldestKey = this.messageCache.keys().next().value;
      if (oldestKey) {
        this.messageCache.delete(oldestKey);
        Logger.info(`Cache limit reached. Removed oldest entry: ${oldestKey}`);
      }
    }
    
    this.messageCache.set(key, messages);
  }

  /**
   * Removes messages from cache for a specific chat
   */
  public clearChatCache(courseId: string, chatId: string): void {
    const key = this.createCacheKey(courseId, chatId);
    this.messageCache.delete(key);
  }

  /**
   * Gets the initial message load limit
   */
  public getInitialMessageLimit(): number {
    return this.INITIAL_MESSAGE_LOAD;
  }

  /**
   * Releases resources after message generation
   */
  public releaseMessageResources(courseId: string, chatId: string): void {
    Logger.info(`Releasing resources for chat ${chatId}`);
    // Resources are released automatically by garbage collection
    // This method serves as a hook for future resource management
  }

  /**
   * Creates a cache key from courseId and chatId
   */
  private createCacheKey(courseId: string, chatId: string): string {
    return `${courseId}:${chatId}`;
  }

  /**
   * Gets current memory usage statistics
   */
  public getMemoryStats(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    cacheSize: number;
  } {
    const memoryUsage = process.memoryUsage();
    return {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      cacheSize: this.messageCache.size,
    };
  }
}

export default ResourceManager;
