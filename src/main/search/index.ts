import { ipcMain } from "electron";
import ChatSearchEngine, { SearchResult } from "./chatSearchEngine";
import Logger from "electron-log";

/**
 * IPC handler for chat search
 */
ipcMain.handle(
  "search:chats",
  async (event, query: string, courseId: string): Promise<SearchResult[]> => {
    try {
      Logger.info(`Search request: "${query}" in course ${courseId}`);
      const results = await ChatSearchEngine.search(query, courseId);
      Logger.info(`Search returned ${results.length} results`);
      return results;
    } catch (error) {
      Logger.error("Error handling search request:", error);
      return [];
    }
  }
);

/**
 * IPC handler to manually rebuild search index
 */
ipcMain.handle(
  "search:rebuildIndex",
  async (event, courseId: string): Promise<void> => {
    try {
      Logger.info(`Rebuilding search index for course ${courseId}`);
      await ChatSearchEngine.buildIndex(courseId);
      Logger.info(`Search index rebuilt successfully for course ${courseId}`);
    } catch (error) {
      Logger.error("Error rebuilding search index:", error);
      throw error;
    }
  }
);

/**
 * IPC handler to get index statistics
 */
ipcMain.handle(
  "search:getStats",
  async (event, courseId: string) => {
    try {
      return ChatSearchEngine.getIndexStats(courseId);
    } catch (error) {
      Logger.error("Error getting search stats:", error);
      return null;
    }
  }
);

/**
 * IPC handler to clear search cache
 */
ipcMain.handle(
  "search:clearCache",
  async () => {
    try {
      ChatSearchEngine.clearSearchCache();
      Logger.info("Search cache cleared");
    } catch (error) {
      Logger.error("Error clearing search cache:", error);
    }
  }
);

// Clear cache on startup to ensure fresh results
ChatSearchEngine.clearSearchCache();

export { ChatSearchEngine, SearchResult };
