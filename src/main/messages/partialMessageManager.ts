import Logger from "electron-log";

/**
 * Manages partial messages for ongoing streaming responses
 * Allows retrieval of current partial message when switching between chats
 */
class PartialMessageManager {
  private static instance: PartialMessageManager | null = null;
  private partialMessages: Map<string, string> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): PartialMessageManager {
    if (!PartialMessageManager.instance) {
      PartialMessageManager.instance = new PartialMessageManager();
    }
    return PartialMessageManager.instance;
  }

  /**
   * Sets the current partial message for a chat
   * @param courseId - Course ID
   * @param chatId - Chat ID
   * @param message - Partial message content
   */
  public setPartialMessage(courseId: string, chatId: string, message: string): void {
    const key = `${courseId}:${chatId}`;
    
    if (message === "") {
      // Clear partial message
      this.partialMessages.delete(key);
      Logger.debug(`Cleared partial message for chat ${chatId}`);
    } else {
      // Set partial message
      this.partialMessages.set(key, message);
      Logger.debug(`Updated partial message for chat ${chatId}: ${message.length} characters`);
    }
  }

  /**
   * Gets the current partial message for a chat
   * @param courseId - Course ID
   * @param chatId - Chat ID
   * @returns Current partial message or empty string if none
   */
  public getPartialMessage(courseId: string, chatId: string): string {
    const key = `${courseId}:${chatId}`;
    const message = this.partialMessages.get(key) || "";
    Logger.debug(`Retrieved partial message for chat ${chatId}: ${message ? `${message.length} characters` : 'none'}`);
    return message;
  }

  /**
   * Checks if a chat has a partial message
   * @param courseId - Course ID
   * @param chatId - Chat ID
   * @returns True if chat has a partial message
   */
  public hasPartialMessage(courseId: string, chatId: string): boolean {
    const key = `${courseId}:${chatId}`;
    return this.partialMessages.has(key);
  }

  /**
   * Clears all partial messages (useful for cleanup)
   */
  public clearAll(): void {
    this.partialMessages.clear();
    Logger.info("Cleared all partial messages");
  }

  /**
   * Gets all active partial message keys (for debugging)
   * @returns Array of active chat keys
   */
  public getActiveChatKeys(): string[] {
    return Array.from(this.partialMessages.keys());
  }

  /**
   * Clears partial message for a specific chat
   * @param courseId - Course ID
   * @param chatId - Chat ID
   */
  public clearPartialMessage(courseId: string, chatId: string): void {
    const key = `${courseId}:${chatId}`;
    this.partialMessages.delete(key);
    Logger.debug(`Cleared partial message for chat ${chatId}`);
  }

  /**
   * Clears all partial messages for a course (when course is deleted)
   * @param courseId - Course ID
   */
  public clearCoursePartialMessages(courseId: string): void {
    const keysToDelete = Array.from(this.partialMessages.keys()).filter(key => 
      key.startsWith(`${courseId}:`)
    );
    
    keysToDelete.forEach(key => this.partialMessages.delete(key));
    Logger.info(`Cleared ${keysToDelete.length} partial messages for course ${courseId}`);
  }
}

export default PartialMessageManager;