import Logger from "electron-log";
import { webContents } from "electron";

/**
 * Manages cancellation of ongoing message generation
 * Allows users to cancel long-running LLM requests
 */
class MessageCancellationManager {
  private static instance: MessageCancellationManager | null = null;
  private activeCancellations: Map<string, boolean> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): MessageCancellationManager {
    if (!MessageCancellationManager.instance) {
      MessageCancellationManager.instance = new MessageCancellationManager();
    }
    return MessageCancellationManager.instance;
  }

  /**
   * Registers a new message generation that can be cancelled
   * @param courseId - Course ID
   * @param chatId - Chat ID
   * @returns Cancellation key
   */
  public registerMessage(courseId: string, chatId: string): string {
    const key = `${courseId}:${chatId}`;
    this.activeCancellations.set(key, false);
    Logger.debug(`Registered cancellable message: ${key}`);
    return key;
  }

  /**
   * Requests cancellation of a message
   * @param courseId - Course ID
   * @param chatId - Chat ID
   */
  public requestCancellation(courseId: string, chatId: string): void {
    const key = `${courseId}:${chatId}`;
    this.activeCancellations.set(key, true);
    Logger.info(`Cancellation requested for message: ${key}`);
    
    // Notify renderer that cancellation was requested
    this.notifyCancellationRequested(courseId, chatId);
  }

  /**
   * Checks if cancellation was requested for a message
   * @param courseId - Course ID
   * @param chatId - Chat ID
   * @returns True if cancellation was requested
   */
  public isCancellationRequested(courseId: string, chatId: string): boolean {
    const key = `${courseId}:${chatId}`;
    return this.activeCancellations.get(key) === true;
  }

  /**
   * Unregisters a message (called when generation completes or is cancelled)
   * @param courseId - Course ID
   * @param chatId - Chat ID
   */
  public unregisterMessage(courseId: string, chatId: string): void {
    const key = `${courseId}:${chatId}`;
    this.activeCancellations.delete(key);
    Logger.debug(`Unregistered message: ${key}`);
  }

  /**
   * Clears all cancellations (useful for cleanup)
   */
  public clearAll(): void {
    this.activeCancellations.clear();
    Logger.info("Cleared all message cancellations");
  }

  /**
   * Notifies renderer that cancellation was requested
   * @param courseId - Course ID
   * @param chatId - Chat ID
   */
  private notifyCancellationRequested(courseId: string, chatId: string): void {
    const windows = webContents.getAllWebContents();
    windows.forEach((webContent) => {
      webContent.send("message:cancellation:requested", { courseId, chatId });
    });
  }
}

export default MessageCancellationManager;
