import path from "path";
import { app } from "electron";
import fs from "fs";
import { v4 as uuid4 } from "uuid";
import MessageDB from "../messages/messageDB";
import { notifyChat } from "./chatNotifier";
import SmartTitleGenerator from "./smartTitleGenerator";
import ChatSearchEngine from "../search/chatSearchEngine";

class ChatsManager {
  private static instances: Map<string, ChatsManager> = new Map();
  private filepath: string;
  private chats: ChatType[];
  private courseId: string;

  public static getInistance(courseId: string): ChatsManager {
    const existing = this.instances.get(courseId);
    if (existing) return existing;

    const folderPath = path.join(app.getPath("userData"), "courses", courseId);
    fs.mkdirSync(folderPath, { recursive: true });

    const filePath = path.join(folderPath, "chats.json");

    if (fs.existsSync(filePath)) {
      const { chats }: { chats: ChatType[] } = JSON.parse(
        fs.readFileSync(filePath, "utf-8")
      );
      const chatsWithParsedDate = chats.map((chat) => ({
        ...chat,
        latestActivity: new Date(chat.latestActivity),
        // Migration: set chatType to "document-based" for existing chats without this field
        chatType: chat.chatType || "document-based",
        // Migration: initialize documentIds array for existing chats
        documentIds: chat.documentIds || [],
      }));
      this.instances.set(
        courseId,
        new ChatsManager(chatsWithParsedDate, filePath, courseId)
      );
    } else {
      const chats: ChatType[] = [];
      fs.writeFileSync(filePath, JSON.stringify({ chats }));
      this.instances.set(courseId, new ChatsManager(chats, filePath, courseId));
    }

    const instance = this.instances.get(courseId);
    if (!instance) {
      throw new Error(`ChatsManager instance not found for courseId: ${courseId}`);
    }
    return instance;
  }

  private constructor(chats: ChatType[], filepath: string, courseId: string) {
    this.chats = chats;
    this.filepath = filepath;
    this.courseId = courseId;
  }

  public getChats(): ChatType[] {
    return this.chats;
  }

  public addChat(title?: string, chatType: "direct" | "document-based" = "document-based"): ChatType {
    const id = uuid4();
    // If no title provided, it will be auto-generated from first message
    const chat: ChatType = { 
      id, 
      title: title || "New Chat", 
      latestActivity: new Date(), 
      chatType,
      documentIds: [] // Initialize empty document IDs array
    };
    this.chats.push(chat);
    this.sortChats();
    this.save();
    notifyChat(this.courseId, this.chats);
    return chat;
  }

  public addDocumentsToChat(chatId: string, documentIds: string[]) {
    this.chats = this.chats.map((chat) => {
      if (chat.id === chatId) {
        // Merge new document IDs with existing ones, avoiding duplicates
        const existingIds = chat.documentIds || [];
        const uniqueIds = [...new Set([...existingIds, ...documentIds])];
        chat.documentIds = uniqueIds;
      }
      return chat;
    });
    this.save();
    notifyChat(this.courseId, this.chats);
  }

  public removeDocumentFromChat(chatId: string, documentId: string) {
    this.chats = this.chats.map((chat) => {
      if (chat.id === chatId && chat.documentIds) {
        chat.documentIds = chat.documentIds.filter(id => id !== documentId);
      }
      return chat;
    });
    this.save();
    notifyChat(this.courseId, this.chats);
  }

  public getChatDocuments(chatId: string): string[] {
    const chat = this.chats.find((chat) => chat.id === chatId);
    return chat?.documentIds || [];
  }

  public async autoGenerateTitle(chatId: string, firstMessage: string) {
    try {
      // Get Ollama configuration
      const { getLLM } = await import("../model");
      const { getOllamaHost } = await import("../ollama");
      
      const model = await getLLM();
      const ollamaHost = getOllamaHost();
      
      if (!model || !ollamaHost) {
        console.warn("LLM not available for title generation, using fallback");
        // Fallback to simple title
        const title = firstMessage.substring(0, 50).trim() + (firstMessage.length > 50 ? "..." : "");
        this.updateChatTitle(chatId, title);
        return;
      }
      
      // Use SmartTitleGenerator to create intelligent title
      const title = await SmartTitleGenerator.generateTitle(firstMessage, ollamaHost, model);
      this.updateChatTitle(chatId, title);
      
    } catch (error) {
      console.error("Failed to auto-generate title:", error);
      // Fallback to simple title
      const title = firstMessage.substring(0, 50).trim() + (firstMessage.length > 50 ? "..." : "");
      this.updateChatTitle(chatId, title);
    }
  }
  
  private updateChatTitle(chatId: string, title: string) {
    this.chats = this.chats.map((chat) => {
      if (chat.id === chatId && chat.title === "New Chat") {
        chat.title = title;
      }
      return chat;
    });
    this.save();
    notifyChat(this.courseId, this.chats);
    
    // Update search index with new title
    ChatSearchEngine.updateIndexForRenamedChat(this.courseId, chatId, title);
  }

  public async removeChat(chatId: string): Promise<ChatType[]> {
    this.chats = this.chats.filter((chat) => chat.id !== chatId);
    this.save();
    MessageDB.getInstance(this.courseId, chatId).deleteDB();
    
    // Delete chat-scoped documents and excerpts
    const { deleteChat } = await import("../documents");
    await deleteChat(chatId);
    
    // Clear conversation context (Requirement 5.3)
    const ConversationContextManager = (await import("../messages/conversationContextManager")).default;
    const contextManager = ConversationContextManager.getInstance();
    await contextManager.clearContext(this.courseId, chatId);
    
    notifyChat(this.courseId, this.chats);
    
    // Remove chat from search index
    ChatSearchEngine.removeFromIndex(this.courseId, chatId);
    
    return this.chats;
  }

  public getChat(chatId: string): ChatType {
    const chat = this.chats.find((chat) => chat.id === chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }
    return chat;
  }

  public renameChat(chatId: string, newTitle: string) {
    // Validate chat name
    const trimmedTitle = newTitle.trim();
    
    // Check if title is empty
    if (!trimmedTitle) {
      throw new Error("Chat name cannot be empty");
    }
    
    // Check maximum length (50 characters as per requirements)
    if (trimmedTitle.length > 50) {
      throw new Error("Chat name cannot exceed 50 characters");
    }
    
    // Check for invalid characters (only allow alphanumeric, spaces, and common punctuation)
    const validNamePattern = /^[a-zA-Z0-9\s\-_.,!?()]+$/;
    if (!validNamePattern.test(trimmedTitle)) {
      throw new Error("Chat name contains invalid characters");
    }
    
    this.chats = this.chats.map((chat) => {
      if (chat.id === chatId) {
        chat.title = trimmedTitle;
      }
      return chat;
    });
    this.save();
    notifyChat(this.courseId, this.chats);
    
    // Update search index with new title
    ChatSearchEngine.updateIndexForRenamedChat(this.courseId, chatId, trimmedTitle);
  }

  public recordNewActivity(chatId: string) {
    this.chats = this.chats.map((chat) => {
      if (chat.id === chatId) {
        chat.latestActivity = new Date();
      }
      return chat;
    });
    this.sortChats();
    this.save();
    notifyChat(this.courseId, this.chats);
  }

  private sortChats() {
    this.chats = this.chats.sort(
      (a, b) => b.latestActivity.getTime() - a.latestActivity.getTime()
    );
  }

  private save() {
    fs.writeFileSync(this.filepath, JSON.stringify({ chats: this.chats }));
  }
}

export default ChatsManager;
