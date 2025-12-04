import ChatsManager from "../chats/chatsManager";
import MessageDB from "../messages/messageDB";
import Logger from "electron-log";

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  matchType: "exact-title" | "partial-title" | "content";
  matchedContent?: string;
  matchedTerms?: string[];
  relevanceScore: number;
  timestamp?: Date;
}

interface ChatIndex {
  chatId: string;
  title: string;
  messages: Array<{ content: string; sender: "human" | "bot" }>;
  lastIndexed: Date;
}

class ChatSearchEngine {
  private static indexes: Map<string, ChatIndex[]> = new Map();
  private static readonly SNIPPET_LENGTH = 150;

  public static async search(query: string, courseId: string): Promise<SearchResult[]> {
    try {
      const normalizedQuery = query.toLowerCase().trim();
      if (!normalizedQuery) return [];

      await this.ensureIndexBuilt(courseId);
      const index = this.indexes.get(courseId) || [];
      const results: SearchResult[] = [];

      for (const chat of index) {
        const titleLower = chat.title.toLowerCase();
        const titleMatch = titleLower.includes(normalizedQuery);

        // Search in messages
        let bestSnippet = "";
        let bestMatchIndex = -1;

        for (const msg of chat.messages) {
          const contentLower = msg.content.toLowerCase();
          const matchIndex = contentLower.indexOf(normalizedQuery);
          
          if (matchIndex !== -1) {
            // Found a match - extract snippet
            const start = Math.max(0, matchIndex - 50);
            const end = Math.min(msg.content.length, matchIndex + normalizedQuery.length + 50);
            bestSnippet = msg.content.substring(start, end);
            if (start > 0) bestSnippet = "..." + bestSnippet;
            if (end < msg.content.length) bestSnippet = bestSnippet + "...";
            bestMatchIndex = matchIndex;
            break;
          }
        }

        // Add result if we found a match
        if (titleMatch || bestMatchIndex !== -1) {
          const matchType = titleMatch ? 
            (titleLower === normalizedQuery ? "exact-title" : "partial-title") : 
            "content";

          results.push({
            chatId: chat.chatId,
            chatTitle: chat.title,
            matchType,
            matchedContent: bestSnippet || undefined,
            matchedTerms: [query], // Pass the original query for highlighting
            relevanceScore: titleMatch ? 1.0 : 0.8,
            timestamp: chat.lastIndexed,
          });
        }
      }

      // Sort by relevance
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      Logger.info(`Search found ${results.length} results for query: "${query}"`);
      return results;
    } catch (error) {
      Logger.error("Error during search:", error);
      return [];
    }
  }

  public static async buildIndex(courseId: string): Promise<void> {
    try {
      Logger.info(`Building search index for course: ${courseId}`);
      const chatsManager = ChatsManager.getInistance(courseId);
      const chats = chatsManager.getChats();
      const indexes: ChatIndex[] = [];

      for (const chat of chats) {
        const messageDB = MessageDB.getInstance(courseId, chat.id);
        const messages = messageDB.getMessages();

        indexes.push({
          chatId: chat.id,
          title: chat.title,
          messages: messages.map((msg) => ({
            content: msg.content,
            sender: msg.sender,
          })),
          lastIndexed: new Date(),
        });
      }

      this.indexes.set(courseId, indexes);
      Logger.info(`Search index built for course ${courseId} (${chats.length} chats)`);
    } catch (error) {
      Logger.error(`Error building search index:`, error);
      throw error;
    }
  }

  public static updateIndexForNewMessage(courseId: string, chatId: string, message: Message): void {
    try {
      const courseIndex = this.indexes.get(courseId);
      if (!courseIndex) return;

      const chatIndex = courseIndex.find((idx) => idx.chatId === chatId);
      if (!chatIndex) {
        this.buildIndex(courseId).catch((error) => Logger.error("Error rebuilding index:", error));
        return;
      }

      chatIndex.messages.push({
        content: message.content,
        sender: message.sender,
      });
      chatIndex.lastIndexed = new Date();
    } catch (error) {
      Logger.error("Error updating search index:", error);
    }
  }

  public static updateIndexForRenamedChat(courseId: string, chatId: string, newTitle: string): void {
    try {
      const courseIndex = this.indexes.get(courseId);
      if (!courseIndex) return;

      const chatIndex = courseIndex.find((idx) => idx.chatId === chatId);
      if (chatIndex) {
        chatIndex.title = newTitle;
        chatIndex.lastIndexed = new Date();
      }
    } catch (error) {
      Logger.error("Error updating index for renamed chat:", error);
    }
  }

  public static removeFromIndex(courseId: string, chatId: string): void {
    try {
      const courseIndex = this.indexes.get(courseId);
      if (!courseIndex) return;

      const filteredIndex = courseIndex.filter((idx) => idx.chatId !== chatId);
      this.indexes.set(courseId, filteredIndex);
    } catch (error) {
      Logger.error("Error removing chat from index:", error);
    }
  }

  public static clearAllIndexes(): void {
    this.indexes.clear();
    Logger.info("All search indexes cleared");
  }

  public static clearSearchCache(): void {
    // No-op for now, kept for API compatibility
  }

  public static getIndexStats(courseId: string): {
    chatCount: number;
    messageCount: number;
    lastIndexed?: Date;
  } | null {
    const courseIndex = this.indexes.get(courseId);
    if (!courseIndex) return null;

    const messageCount = courseIndex.reduce((sum, idx) => sum + idx.messages.length, 0);
    const lastIndexed = courseIndex.reduce(
      (latest, idx) => (idx.lastIndexed > latest ? idx.lastIndexed : latest),
      new Date(0)
    );

    return {
      chatCount: courseIndex.length,
      messageCount,
      lastIndexed,
    };
  }

  private static async ensureIndexBuilt(courseId: string): Promise<void> {
    if (!this.indexes.has(courseId)) {
      await this.buildIndex(courseId);
    }
  }
}

export default ChatSearchEngine;
