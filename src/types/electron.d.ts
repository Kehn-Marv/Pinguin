/**
 * TypeScript definitions for Electron API exposed to renderer process
 */

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

interface AppConfig {
  theme: "light" | "dark" | "system";
  activeLLM: string;
  activeEmbeddingModel: string;
  studyMode: "files" | "coding" | "thinking";
  ollamaPort: number;
  pythonBackendPort: number;
  maxContextMessages: number;
  retrievalTopK: number;
  similarityThreshold: number;
  chunkSize: number;
  chunkOverlap: number;
  modelInstallationLocation: string;
  embeddingBatchSize: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  maxCacheEntries: number;
  isFirstRun: boolean;
}

interface ElectronAPI {
  document: {
    ingest: (filePath: string) => Promise<{ success: boolean; docId?: string; metadata?: DocumentMetadata; error?: string }>;
    delete: (docId: string) => Promise<{ success: boolean; error?: string }>;
    list: () => Promise<{ success: boolean; documents?: DocumentMetadata[]; error?: string }>;
    get: (docId: string) => Promise<{ success: boolean; document?: DocumentMetadata; error?: string }>;
  };

  query: {
    submit: (message: string, mode: string) => Promise<{ success: boolean; error?: string }>;
    cancel: () => Promise<{ success: boolean; error?: string }>;
    onToken: (callback: (token: string) => void) => () => void;
    onComplete: (callback: (data: { sources: any[]; scores: number[] }) => void) => () => void;
    onCancelled: (callback: () => void) => () => void;
    onError: (callback: (error: string) => void) => () => void;
  };

  model: {
    list: (type: "llm" | "embedding") => Promise<{ success: boolean; models?: any[]; error?: string }>;
    download: (modelName: string) => Promise<{ success: boolean; error?: string }>;
    setActive: (type: "llm" | "embedding", modelName: string) => Promise<{ success: boolean; error?: string }>;
    onDownloadProgress: (callback: (progress: { status: string; completed?: number; total?: number }) => void) => () => void;
  };

  config: {
    get: () => Promise<{ success: boolean; config?: AppConfig; error?: string }>;
    set: (config: Partial<AppConfig>) => Promise<{ success: boolean; error?: string }>;
    reset: () => Promise<{ success: boolean; error?: string }>;
  };

  chat: {
    getHistory: () => Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }>;
    clearHistory: () => Promise<{ success: boolean; error?: string }>;
  };

  system: {
    getVersion: () => Promise<{ success: boolean; version?: string }>;
    getServiceStatus: () => Promise<{ success: boolean; ollama?: boolean; python?: boolean }>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
