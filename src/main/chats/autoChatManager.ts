import ChatsManager from "./chatsManager";
import SmartTitleGenerator from "./smartTitleGenerator";

/**
 * AutoChatManager
 * 
 * Handles automatic chat creation when users send messages without an active chat.
 * Ensures seamless chat creation with smart title generation.
 */
class AutoChatManager {
  /**
   * Creates a new chat if none exists and returns the chat ID
   * @param courseId - The course ID (internal organization)
   * @param chatId - The current chat ID (may be undefined)
   * @param firstMessage - The user's first message
   * @returns The created or existing chat identifiers
   */
  static async ensureChatExists(
    courseId: string,
    chatId: string | undefined,
    firstMessage: string
  ): Promise<{ courseId: string; chatId: string }> {
    // If chat already exists, return it
    if (chatId) {
      return { courseId, chatId };
    }
    
    // Generate smart title from first message
    try {
      const { getLLM } = await import("../model");
      const { getOllamaHost } = await import("../ollama");
      
      const model = await getLLM();
      const ollamaHost = getOllamaHost();
      
      let title: string;
      
      if (model && ollamaHost) {
        title = await SmartTitleGenerator.generateTitle(firstMessage, ollamaHost, model);
      } else {
        // Fallback to simple title
        title = firstMessage.substring(0, 50).trim() + (firstMessage.length > 50 ? "..." : "");
      }
      
      // Create new chat with generated title
      const chatManager = ChatsManager.getInistance(courseId);
      const newChat = chatManager.addChat(title, "direct");
      
      return {
        courseId,
        chatId: newChat.id,
      };
    } catch (error) {
      console.error("Failed to generate title in autoChatManager:", error);
      // Fallback: create chat with simple title
      const title = firstMessage.substring(0, 50).trim() + (firstMessage.length > 50 ? "..." : "");
      const chatManager = ChatsManager.getInistance(courseId);
      const newChat = chatManager.addChat(title, "direct");
      
      return {
        courseId,
        chatId: newChat.id,
      };
    }
  }
}

export default AutoChatManager;
