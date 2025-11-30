import path from "path";
import { app } from "electron";
import fs from "fs";
import Logger from "electron-log";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Interface for persisted conversation context
 */
interface ConversationContext {
  courseId: string;
  chatId: string;
  messages: {
    content: string;
    sender: "human" | "bot";
    timestamp: number;
  }[];
  lastUpdated: number;
  tokenCount: number;
}

/**
 * Manages conversation context persistence and restoration
 * Implements Requirements 5.3, 5.4, 5.5
 */
export class ConversationContextManager {
  private static instance: ConversationContextManager;
  private contextCache: Map<string, ConversationContext>;
  private readonly MAX_CONTEXT_MESSAGES = 20; // 10 pairs
  private readonly MAX_CONTEXT_TOKENS = 2000;

  private constructor() {
    this.contextCache = new Map();
    Logger.info("ConversationContextManager initialized");
  }

  public static getInstance(): ConversationContextManager {
    if (!ConversationContextManager.instance) {
      ConversationContextManager.instance = new ConversationContextManager();
    }
    return ConversationContextManager.instance;
  }

  /**
   * Gets the storage path for a specific chat's context
   */
  private getContextPath(courseId: string, chatId: string): string {
    const contextDir = path.join(
      app.getPath("userData"),
      "courses",
      courseId,
      "contexts"
    );
    fs.mkdirSync(contextDir, { recursive: true });
    return path.join(contextDir, `${chatId}.json`);
  }

  /**
   * Generates a cache key for a chat
   */
  private getCacheKey(courseId: string, chatId: string): string {
    return `${courseId}:${chatId}`;
  }

  /**
   * Estimates token count for a message (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Persists conversation context to local storage after each exchange
   * Implements Requirement 5.3
   */
  public async persistContext(
    courseId: string,
    chatId: string,
    messages: { content: string; sender: "human" | "bot" }[]
  ): Promise<void> {
    try {
      // Take only the last MAX_CONTEXT_MESSAGES messages
      const recentMessages = messages.slice(-this.MAX_CONTEXT_MESSAGES);

      // Calculate total tokens and truncate if needed
      let totalTokens = 0;
      const truncatedMessages: typeof recentMessages = [];

      // Add messages from most recent, stopping if we exceed token limit
      for (let i = recentMessages.length - 1; i >= 0; i--) {
        const messageTokens = this.estimateTokens(recentMessages[i].content);
        if (totalTokens + messageTokens > this.MAX_CONTEXT_TOKENS) {
          Logger.info(
            `Context truncated at ${truncatedMessages.length} messages (~${totalTokens} tokens) for chat ${chatId}`
          );
          break;
        }
        truncatedMessages.unshift(recentMessages[i]);
        totalTokens += messageTokens;
      }

      const context: ConversationContext = {
        courseId,
        chatId,
        messages: truncatedMessages.map((msg) => ({
          ...msg,
          timestamp: Date.now(),
        })),
        lastUpdated: Date.now(),
        tokenCount: totalTokens,
      };

      // Update cache
      const cacheKey = this.getCacheKey(courseId, chatId);
      this.contextCache.set(cacheKey, context);

      // Persist to disk
      const contextPath = this.getContextPath(courseId, chatId);
      await fs.promises.writeFile(
        contextPath,
        JSON.stringify(context, null, 2),
        "utf-8"
      );

      Logger.info(
        `Persisted context for chat ${chatId}: ${truncatedMessages.length} messages (~${totalTokens} tokens)`
      );
    } catch (error) {
      Logger.error(
        `Error persisting context for chat ${chatId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Restores conversation history on application restart
   * Implements Requirement 5.4
   */
  public async restoreContext(
    courseId: string,
    chatId: string
  ): Promise<ConversationContext | null> {
    try {
      const cacheKey = this.getCacheKey(courseId, chatId);

      // Check cache first
      const cached = this.contextCache.get(cacheKey);
      if (cached) {
        Logger.info(`Restored context from cache for chat ${chatId}`);
        return cached;
      }

      // Load from disk
      const contextPath = this.getContextPath(courseId, chatId);
      if (!fs.existsSync(contextPath)) {
        Logger.info(`No persisted context found for chat ${chatId}`);
        return null;
      }

      const data = await fs.promises.readFile(contextPath, "utf-8");
      const context: ConversationContext = JSON.parse(data);

      // Update cache
      this.contextCache.set(cacheKey, context);

      Logger.info(
        `Restored context from disk for chat ${chatId}: ${context.messages.length} messages (~${context.tokenCount} tokens)`
      );
      return context;
    } catch (error) {
      Logger.error(
        `Error restoring context for chat ${chatId}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  /**
   * Converts persisted context to LangChain message format
   */
  public contextToLangChainMessages(
    context: ConversationContext | null
  ): (HumanMessage | AIMessage)[] {
    if (!context || !context.messages.length) {
      return [];
    }

    return context.messages.map((msg) =>
      msg.sender === "human"
        ? new HumanMessage(this.sanitize(msg.content))
        : new AIMessage(this.sanitize(msg.content))
    );
  }

  /**
   * Clears context for a specific chat
   */
  public async clearContext(courseId: string, chatId: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(courseId, chatId);
      this.contextCache.delete(cacheKey);

      const contextPath = this.getContextPath(courseId, chatId);
      if (fs.existsSync(contextPath)) {
        await fs.promises.unlink(contextPath);
        Logger.info(`Cleared context for chat ${chatId}`);
      }
    } catch (error) {
      Logger.error(
        `Error clearing context for chat ${chatId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Clears all contexts for a course
   */
  public async clearCourseContexts(courseId: string): Promise<void> {
    try {
      const contextDir = path.join(
        app.getPath("userData"),
        "courses",
        courseId,
        "contexts"
      );

      if (fs.existsSync(contextDir)) {
        const files = await fs.promises.readdir(contextDir);
        for (const file of files) {
          const filePath = path.join(contextDir, file);
          await fs.promises.unlink(filePath);
        }
        Logger.info(`Cleared all contexts for course ${courseId}`);
      }

      // Clear from cache
      for (const key of this.contextCache.keys()) {
        if (key.startsWith(`${courseId}:`)) {
          this.contextCache.delete(key);
        }
      }
    } catch (error) {
      Logger.error(
        `Error clearing contexts for course ${courseId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Gets context statistics for monitoring
   */
  public getContextStats(
    courseId: string,
    chatId: string
  ): {
    messageCount: number;
    tokenCount: number;
    lastUpdated: number | null;
  } | null {
    const cacheKey = this.getCacheKey(courseId, chatId);
    const context = this.contextCache.get(cacheKey);

    if (!context) {
      return null;
    }

    return {
      messageCount: context.messages.length,
      tokenCount: context.tokenCount,
      lastUpdated: context.lastUpdated,
    };
  }

  /**
   * Sanitizes text for use in prompts
   */
  private sanitize(text: string): string {
    return text.replace(/{/g, "{{").replace(/}/g, "}}");
  }

  /**
   * Preloads contexts for multiple chats (optimization for startup)
   * Implements Requirement 5.5
   */
  public async preloadContexts(
    courseId: string,
    chatIds: string[]
  ): Promise<void> {
    try {
      Logger.info(
        `Preloading contexts for ${chatIds.length} chats in course ${courseId}`
      );

      const loadPromises = chatIds.map((chatId) =>
        this.restoreContext(courseId, chatId)
      );

      await Promise.all(loadPromises);

      Logger.info(
        `Preloaded ${chatIds.length} contexts for course ${courseId}`
      );
    } catch (error) {
      Logger.error(
        `Error preloading contexts for course ${courseId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

export default ConversationContextManager;
