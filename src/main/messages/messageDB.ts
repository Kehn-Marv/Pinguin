import path from "path";
import { app } from "electron";
import fs from "fs";
import { notifyCompleteMessage } from "./messageNotifier";
import { recordNewChatActivity } from "../chats";
import ResourceManager from "../utils/resourceManager";

class MessageDB {
  private static inistances: Map<string, MessageDB> = new Map();
  private messages: Message[];
  private filePath: string;
  private courseId: string;
  private chatId: string;

  public static getInstance(courseId: string, chatId: string): MessageDB {
    // Use composite key to ensure proper isolation between courses
    const instanceKey = `${courseId}:${chatId}`;
    const existing = this.inistances.get(instanceKey);
    if (existing) return existing;
    const folderPath = path.join(
      app.getPath("userData"),
      "courses",
      courseId,
      "chats"
    );
    fs.mkdirSync(folderPath, { recursive: true });
    const filePath = path.join(folderPath, chatId + ".json");
    if (fs.existsSync(filePath)) {
      const { messages }: { messages: Message[] } = JSON.parse(
        fs.readFileSync(filePath, "utf-8")
      );
      this.inistances.set(
        instanceKey,
        new MessageDB(courseId, chatId, messages, filePath)
      );
    } else {
      const messages: Message[] = [];
      fs.writeFileSync(filePath, JSON.stringify({ messages }));
      this.inistances.set(
        instanceKey,
        new MessageDB(courseId, chatId, messages, filePath)
      );
    }
    const instance = this.inistances.get(instanceKey);
    if (!instance) {
      throw new Error(`MessageDB instance not found for chatId: ${chatId}`);
    }
    return instance;
  }

  private constructor(
    courseId: string,
    chatId: string,
    messages: Message[],
    filePath: string
  ) {
    this.courseId = courseId;
    this.chatId = chatId;
    this.messages = messages;
    this.filePath = filePath;
  }

  public addMessage(
    content: string,
    sender: "human" | "bot",
    citations: Citation[] = [],
    documentIds?: string[]
  ): Message {
    // Check for duplicate messages to prevent double-adding
    const isDuplicate = this.messages.some(existingMessage => 
      existingMessage.content === content && 
      existingMessage.sender === sender &&
      // For bot messages, also check citations to ensure it's truly the same message
      (sender === "human" || JSON.stringify(existingMessage.citations) === JSON.stringify(citations))
    );
    
    if (isDuplicate) {
      console.log("Duplicate message detected in MessageDB, skipping:", { content: content.substring(0, 50), sender });
      // Return the existing message instead of creating a duplicate
      return this.messages.find(m => m.content === content && m.sender === sender)!;
    }
    
    const message: Message = { content, sender, citations, documentIds };
    this.messages.push(message);
    this.save();
    
    // Clear the cache for this chat so fresh messages are loaded
    this.clearCache();
    
    console.log("Adding new message to DB:", { content: content.substring(0, 50), sender, chatId: this.chatId });
    notifyCompleteMessage(this.courseId, this.chatId, message);
    recordNewChatActivity(this.courseId, this.chatId);
    return message;
  }
  
  private clearCache(): void {
    // Clear the ResourceManager cache for this chat
    try {
      const resourceManager = ResourceManager.getInstance();
      resourceManager.clearChatCache(this.courseId, this.chatId);
      console.log(`Cache cleared for chat ${this.chatId}`);
    } catch (error) {
      console.error("Failed to clear cache:", error);
    }
  }

  public getMessages(limit?: number, offset?: number): Message[] {
    // If no limit specified, return all messages in chronological order
    if (limit === undefined) {
      return this.messages;
    }
    
    // For lazy loading, we want to load newest messages first
    // So we slice from the end of the array backwards
    const totalMessages = this.messages.length;
    const start = Math.max(0, totalMessages - (offset || 0) - limit);
    const end = totalMessages - (offset || 0);
    
    return this.messages.slice(start, end);
  }

  public getMessageCount(): number {
    return this.messages.length;
  }

  public deleteDB() {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
  }

  private save() {
    fs.writeFileSync(
      this.filePath,
      JSON.stringify({ messages: this.messages })
    );
  }
}

export default MessageDB;
