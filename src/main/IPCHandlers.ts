import { ipcMain, IpcMainInvokeEvent, app } from "electron";
import logger from "electron-log";
import ProcessManager from "./ProcessManager";
import ConfigStore, { AppConfig } from "./ConfigStore";
import path from "path";
import fs from "fs";

const log = logger.log;

interface DocumentMetadata {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  fileSize: number;
  uploadDate: string;
  pageCount?: number;
  chunkCount: number;
  contentHash: string;
  processingStatus: "pending" | "processing" | "completed" | "failed";
  errorMessage?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  sources?: any[];
  mode: string;
}

class IPCHandlers {
  private static instance: IPCHandlers;
  private processManager: ProcessManager;
  private configStore: ConfigStore;
  private documents: Map<string, DocumentMetadata>;
  private chatHistory: ChatMessage[];
  private currentQueryAbortController: AbortController | null;

  private constructor() {
    this.processManager = ProcessManager.getInstance();
    this.configStore = ConfigStore.getInstance();
    this.documents = new Map();
    this.chatHistory = [];
    this.currentQueryAbortController = null;
    
    this.loadDocumentsFromDisk();
    this.loadChatHistoryFromDisk();
  }

  public static getInstance(): IPCHandlers {
    if (!IPCHandlers.instance) {
      IPCHandlers.instance = new IPCHandlers();
    }
    return IPCHandlers.instance;
  }

  public registerHandlers(): void {
    log("Registering IPC handlers");
    // Only register Ollama handlers - other handlers are registered by their respective modules
    this.registerOllamaHandlers();
  }

  private registerDocumentHandlers(): void {
    ipcMain.handle("document:ingest", async (_event, filePath: string) => {
      try {
        log(`Ingesting document: ${filePath}`);
        if (!fs.existsSync(filePath)) throw new Error("File does not exist");

        const stats = fs.statSync(filePath);
        const filename = path.basename(filePath);
        const fileType = path.extname(filePath).toLowerCase().slice(1);
        const docId = this.generateId();
        
        const docMetadata: DocumentMetadata = {
          id: docId,
          filename,
          filepath: filePath,
          fileType,
          fileSize: stats.size,
          uploadDate: new Date().toISOString(),
          chunkCount: 0,
          contentHash: "",
          processingStatus: "pending",
        };

        this.documents.set(docId, docMetadata);
        this.saveDocumentsToDisk();

        const backendHost = this.processManager.getPythonBackendHost();
        if (!backendHost) throw new Error("Python backend is not running");

        docMetadata.processingStatus = "processing";
        this.documents.set(docId, docMetadata);

        const response = await fetch(`${backendHost}/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_path: filePath, doc_id: docId, metadata: { filename, file_type: fileType } }),
        });

        if (!response.ok) throw new Error(`Backend error: ${await response.text()}`);

        const result = await response.json();
        docMetadata.chunkCount = result.chunks_created || 0;
        docMetadata.contentHash = result.content_hash || "";
        docMetadata.pageCount = result.page_count;
        docMetadata.processingStatus = "completed";
        this.documents.set(docId, docMetadata);
        this.saveDocumentsToDisk();

        log(`Document ingested successfully: ${docId}`);
        return { success: true, docId, metadata: docMetadata };
      } catch (error: any) {
        log(`Error ingesting document: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("document:delete", async (_event, docId: string) => {
      try {
        log(`Deleting document: ${docId}`);
        const doc = this.documents.get(docId);
        if (!doc) throw new Error("Document not found");

        const backendHost = this.processManager.getPythonBackendHost();
        if (backendHost) {
          await fetch(`${backendHost}/documents/${docId}`, { method: "DELETE" });
        }

        this.documents.delete(docId);
        this.saveDocumentsToDisk();
        log(`Document deleted: ${docId}`);
        return { success: true };
      } catch (error: any) {
        log(`Error deleting document: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("document:list", async () => {
      try {
        const docs = Array.from(this.documents.values());
        return { success: true, documents: docs };
      } catch (error: any) {
        log(`Error listing documents: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("document:get", async (_event, docId: string) => {
      try {
        const doc = this.documents.get(docId);
        if (!doc) throw new Error("Document not found");
        return { success: true, document: doc };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  private registerQueryHandlers(): void {
    ipcMain.handle("query:submit", async (event: IpcMainInvokeEvent, message: string, mode: string) => {
      try {
        log(`Processing query in ${mode} mode: ${message}`);
        const backendHost = this.processManager.getPythonBackendHost();
        const ollamaHost = this.processManager.getOllamaHost();
        if (!backendHost || !ollamaHost) throw new Error("Services are not running");

        const activeLLM = this.configStore.get("activeLLM");
        const topK = this.configStore.get("retrievalTopK");
        const maxContext = this.configStore.get("maxContextMessages");
        if (!activeLLM) throw new Error("No active LLM model selected");

        this.currentQueryAbortController = new AbortController();

        const retrieveResponse = await fetch(`${backendHost}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: message, top_k: topK, mode }),
          signal: this.currentQueryAbortController.signal,
        });

        if (!retrieveResponse.ok) throw new Error("Failed to retrieve context");
        const { chunks, scores } = await retrieveResponse.json();

        const prompt = this.constructPrompt(message, chunks, mode, maxContext);

        const generateResponse = await fetch(`${ollamaHost}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: activeLLM, prompt, stream: true }),
          signal: this.currentQueryAbortController.signal,
        });

        if (!generateResponse.ok) throw new Error("Failed to generate response");

        const reader = generateResponse.body?.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        if (reader) {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((line) => line.trim());

            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                if (json.response) {
                  fullResponse += json.response;
                  event.sender.send("query:token", json.response);
                }
                if (json.done) break;
              } catch {
                // Ignore JSON parse errors
              }
            }
          }
        }

        this.addMessageToHistory({
          id: this.generateId(),
          role: "user",
          content: message,
          timestamp: new Date().toISOString(),
          mode,
        });

        this.addMessageToHistory({
          id: this.generateId(),
          role: "assistant",
          content: fullResponse,
          timestamp: new Date().toISOString(),
          sources: chunks,
          mode,
        });

        event.sender.send("query:complete", { sources: chunks, scores });
        this.currentQueryAbortController = null;
        return { success: true };
      } catch (error: any) {
        if (error.name === "AbortError") {
          log("Query cancelled by user");
          event.sender.send("query:cancelled");
          return { success: false, error: "Query cancelled" };
        }
        log(`Error processing query: ${error.message}`);
        event.sender.send("query:error", error.message);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("query:cancel", async () => {
      try {
        if (this.currentQueryAbortController) {
          this.currentQueryAbortController.abort();
          this.currentQueryAbortController = null;
          log("Query cancelled");
        }
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  private registerModelHandlers(): void {
    ipcMain.handle("model:list", async () => {
      try {
        const ollamaHost = this.processManager.getOllamaHost();
        if (!ollamaHost) throw new Error("Ollama is not running");

        const response = await fetch(`${ollamaHost}/api/tags`);
        if (!response.ok) throw new Error("Failed to list models");

        const data = await response.json();
        return { success: true, models: data.models || [] };
      } catch (error: any) {
        log(`Error listing models: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("model:download", async (event: IpcMainInvokeEvent, modelName: string) => {
      try {
        log(`Downloading model: ${modelName}`);
        const ollamaHost = this.processManager.getOllamaHost();
        if (!ollamaHost) throw new Error("Ollama is not running");

        const response = await fetch(`${ollamaHost}/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: modelName, stream: true }),
        });

        if (!response.ok) throw new Error("Failed to download model");

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((line) => line.trim());

            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                if (json.status) {
                  event.sender.send("model:download-progress", {
                    status: json.status,
                    completed: json.completed,
                    total: json.total,
                  });
                }
              } catch {
                // Ignore JSON parse errors
              }
            }
          }
        }

        log(`Model downloaded: ${modelName}`);
        return { success: true };
      } catch (error: any) {
        log(`Error downloading model: ${error.message}`);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("model:set-active", async (_event, type: "llm" | "embedding", modelName: string) => {
      try {
        log(`Setting active ${type} model: ${modelName}`);
        const ollamaHost = this.processManager.getOllamaHost();
        if (ollamaHost) {
          const response = await fetch(`${ollamaHost}/api/show`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: modelName }),
          });
          if (!response.ok) throw new Error("Model not found");
        }

        if (type === "llm") {
          this.configStore.set("activeLLM", modelName);
        } else {
          this.configStore.set("activeEmbeddingModel", modelName);
        }

        return { success: true };
      } catch (error: any) {
        log(`Error setting active model: ${error.message}`);
        return { success: false, error: error.message };
      }
    });
  }

  private registerConfigHandlers(): void {
    ipcMain.handle("config:get", async () => {
      try {
        const config = this.configStore.getAll();
        return { success: true, config };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("config:set", async (_event, config: Partial<AppConfig>) => {
      try {
        this.configStore.setMultiple(config);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("config:reset", async () => {
      try {
        this.configStore.reset();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  private registerChatHistoryHandlers(): void {
    ipcMain.handle("chat:get-history", async () => {
      try {
        return { success: true, messages: this.chatHistory };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("chat:clear-history", async () => {
      try {
        this.chatHistory = [];
        this.saveChatHistoryToDisk();
        log("Chat history cleared");
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  private registerSystemHandlers(): void {
    ipcMain.handle("system:get-version", async () => {
      return { success: true, version: app.getVersion() };
    });

    ipcMain.handle("system:service-status", async () => {
      return {
        success: true,
        ollama: this.processManager.isOllamaRunning(),
        python: this.processManager.isPythonBackendRunning(),
      };
    });
  }

  private registerOllamaHandlers(): void {
    // Dynamic import to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OllamaManager = require("./ollama/OllamaManager").default;
    const ollamaManager = OllamaManager.getInstance();

    ipcMain.handle("ollama:initialize", async () => {
      try {
        log("Initializing Ollama via IPC");
        const result = await ollamaManager.initialize();
        return { success: true, ...result };
      } catch (error: any) {
        log(`Error initializing Ollama: ${error.message}`);
        return { 
          success: false, 
          status: "error",
          error: error.message 
        };
      }
    });

    ipcMain.handle("ollama:get-status", async () => {
      try {
        const status = ollamaManager.getStatus();
        const host = ollamaManager.getHost();
        return { 
          success: true, 
          status,
          host,
          isRunning: this.processManager.isOllamaRunning()
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("ollama:stop", async () => {
      try {
        ollamaManager.stop();
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
  }

  private constructPrompt(query: string, chunks: any[], mode: string, maxContext: number): string {
    const systemPrompts: Record<string, string> = {
      files: "You are a study assistant helping a university student. Answer questions based ONLY on the provided document excerpts. Always cite sources with [Document Name - Page X]. If information is not in the documents, say so clearly.",
      coding: "You are a coding tutor helping a student learn programming. Provide clear code examples, explain syntax, and highlight best practices. Reference the student's materials when available.",
      thinking: "You are a Socratic tutor helping a student think deeply. Ask probing questions, explore concepts from multiple angles, and guide the student to discover insights. Use their materials as a foundation.",
    };

    const systemPrompt = systemPrompts[mode] || systemPrompts.files;

    const contextParts = chunks.map((chunk, i) => {
      const citation = `[${chunk.metadata?.filename || "Unknown"} - Page ${chunk.metadata?.page || "N/A"}]`;
      return `Source ${i + 1} ${citation}:\n${chunk.text}\n`;
    });

    const recentHistory = this.chatHistory.slice(-maxContext);
    const historyParts = recentHistory.map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      return `${role}: ${msg.content}`;
    });

    return `${systemPrompt}

# Retrieved Context
${contextParts.join("\n")}

# Conversation History
${historyParts.join("\n")}

# Current Question
User: ${query}
Assistant: ${query}`;
  }

  private addMessageToHistory(message: ChatMessage): void {
    this.chatHistory.push(message);
    this.saveChatHistoryToDisk();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private loadDocumentsFromDisk(): void {
    try {
      const docsPath = this.getDocumentsStoragePath();
      if (fs.existsSync(docsPath)) {
        const data = fs.readFileSync(docsPath, "utf-8");
        const docs = JSON.parse(data);
        this.documents = new Map(Object.entries(docs));
        log(`Loaded ${this.documents.size} documents from disk`);
      }
    } catch (error: any) {
      log(`Error loading documents: ${error.message}`);
    }
  }

  private saveDocumentsToDisk(): void {
    try {
      const docsPath = this.getDocumentsStoragePath();
      const docsDir = path.dirname(docsPath);
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }
      const docsObj = Object.fromEntries(this.documents);
      fs.writeFileSync(docsPath, JSON.stringify(docsObj, null, 2));
    } catch (error: unknown) {
      log(`Error saving documents: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private getDocumentsStoragePath(): string {
    return path.join(app.getPath("userData"), "documents.json");
  }

  private loadChatHistoryFromDisk(): void {
    try {
      const historyPath = this.getChatHistoryStoragePath();
      if (fs.existsSync(historyPath)) {
        const data = fs.readFileSync(historyPath, "utf-8");
        this.chatHistory = JSON.parse(data);
        log(`Loaded ${this.chatHistory.length} messages from disk`);
      }
    } catch (error: unknown) {
      log(`Error loading chat history: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private saveChatHistoryToDisk(): void {
    try {
      const historyPath = this.getChatHistoryStoragePath();
      const historyDir = path.dirname(historyPath);
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }
      fs.writeFileSync(historyPath, JSON.stringify(this.chatHistory, null, 2));
    } catch (error: unknown) {
      log(`Error saving chat history: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private getChatHistoryStoragePath(): string {
    return path.join(app.getPath("userData"), "chat-history.json");
  }
}

export default IPCHandlers;
