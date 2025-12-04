import { ipcMain } from "electron";
import MessageDB from "./messageDB";
import loadingMessage from "./loadingMessages";
import sendMessage from "./sendMessage";
import ChatsManager from "../chats/chatsManager";
import Logger from "electron-log";
import ResourceManager from "../utils/resourceManager";
import ConversationContextManager from "./conversationContextManager";

ipcMain.handle(
  "message:get",
  async (event, courseId: string, chatId: string, limit?: number, offset?: number) => {
    const resourceManager = ResourceManager.getInstance();
    const messageDB = MessageDB.getInstance(courseId, chatId);
    
    // Always get fresh messages from DB to ensure we have the latest
    // The cache is now only used as a performance optimization for unchanged chats
    const messages = messageDB.getMessages(limit, offset);
    
    Logger.info(`Loaded ${messages.length} messages for chat ${chatId} (limit: ${limit}, offset: ${offset})`);
    
    // Update cache with fresh messages if this is a full load (no pagination)
    if (limit === undefined && offset === undefined) {
      resourceManager.cacheMessages(courseId, chatId, messages);
    }
    
    return messages;
  }
);

ipcMain.handle(
  "message:count",
  async (event, courseId: string, chatId: string) => {
    const messageDB = MessageDB.getInstance(courseId, chatId);
    return messageDB.getMessageCount();
  }
);

ipcMain.handle(
  "message:isLoading",
  async (event, courseId: string, chatId: string) => {
    const isLoading = loadingMessage.isChatWithLoadingMessage(courseId, chatId);
    Logger.info(`[IPC] isLoading for chat ${chatId}: ${isLoading}`);
    return isLoading;
  }
);

ipcMain.handle(
  "message:getPartialMessage",
  async (event, courseId: string, chatId: string) => {
    const PartialMessageManager = (await import("./partialMessageManager")).default;
    const partialMessageManager = PartialMessageManager.getInstance();
    const partialMessage = partialMessageManager.getPartialMessage(courseId, chatId);
    Logger.info(`[IPC] getPartialMessage for chat ${chatId}: ${partialMessage ? `${partialMessage.length} characters` : 'none'}`);
    return partialMessage;
  }
);

ipcMain.handle(
  "message:cancel",
  async (event, courseId: string, chatId: string) => {
    try {
      Logger.info(`Cancelling message generation for chat ${chatId}`);
      
      // Request cancellation through the cancellation manager
      const MessageCancellationManager = (await import("./messageCancellation")).default;
      const cancellationManager = MessageCancellationManager.getInstance();
      cancellationManager.requestCancellation(courseId, chatId);
      
      // Remove loading state
      loadingMessage.removeLoadingMessageChat(courseId, chatId);
      
      // Clear any partial message
      const { notifyPartialMessage, notifySlowResponse } = await import("./messageNotifier");
      notifyPartialMessage(courseId, chatId, "");
      notifySlowResponse(courseId, chatId, false);
      
      return { success: true };
    } catch (error) {
      Logger.error(`Error cancelling message for chat ${chatId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
);

// Context management handlers
ipcMain.handle(
  "context:restore",
  async (event, courseId: string, chatId: string) => {
    try {
      const contextManager = ConversationContextManager.getInstance();
      const context = await contextManager.restoreContext(courseId, chatId);
      return { success: true, context };
    } catch (error) {
      Logger.error(`Error restoring context for chat ${chatId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
);

ipcMain.handle(
  "context:clear",
  async (event, courseId: string, chatId: string) => {
    try {
      const contextManager = ConversationContextManager.getInstance();
      await contextManager.clearContext(courseId, chatId);
      return { success: true };
    } catch (error) {
      Logger.error(`Error clearing context for chat ${chatId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
);

ipcMain.handle(
  "context:stats",
  async (event, courseId: string, chatId: string) => {
    try {
      const contextManager = ConversationContextManager.getInstance();
      const stats = contextManager.getContextStats(courseId, chatId);
      return { success: true, stats };
    } catch (error) {
      Logger.error(`Error getting context stats for chat ${chatId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
);

ipcMain.handle(
  "context:preload",
  async (event, courseId: string, chatIds: string[]) => {
    try {
      const contextManager = ConversationContextManager.getInstance();
      await contextManager.preloadContexts(courseId, chatIds);
      return { success: true };
    } catch (error) {
      Logger.error(`Error preloading contexts for course ${courseId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
);


ipcMain.handle(
  "message:send",
  async (event, courseId: string, chatId: string, message: string, mode?: "thinking" | "coding", documentIds?: string[]) => {
    try {
      // Validate input parameters
      if (!courseId || !chatId || !message) {
        const errorMsg = "Invalid message parameters: courseId, chatId, and message are required";
        Logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Get chat manager instance
      let chatManager;
      try {
        chatManager = ChatsManager.getInistance(courseId);
      } catch (error) {
        const errorMsg = `Failed to get chat manager for course ${courseId}`;
        Logger.error(errorMsg, error);
        throw new Error(errorMsg);
      }

      // Verify chat exists
      try {
        chatManager.getChat(chatId);
      } catch (error) {
        const errorMsg = `Chat not found: ${chatId}`;
        Logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Always use document-based chat - it will automatically use documents if available
      // or fall back to direct chat if no documents are found
      Logger.info(`Routing message for chat ${chatId}:`, {
        mode: mode || "normal",
        courseId,
        hasMessage: !!message,
        documentIds: documentIds || [],
      });

      Logger.info(`Using document-based handler for chat ${chatId} (will auto-detect documents)`);
      await sendMessage(courseId, chatId, message, mode, documentIds);
      Logger.info(`Message routing completed successfully for chat ${chatId}`);
    } catch (error) {
      // Log detailed error information
      Logger.error(`Error in message routing for chat ${chatId}:`, {
        error: error instanceof Error ? error.message : String(error),
        courseId,
        chatId,
        mode,
      });

      // Re-throw with appropriate error message
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error("Failed to send message. Please try again.");
      }
    }
  }
);
