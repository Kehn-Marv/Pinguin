import { IDocumentAPI } from "./renderer/preload/document";
import { IChatAPI } from "./renderer/preload/chat";
import { IMessageAPI } from "./renderer/preload/message";
import { ICourseAPI } from "./renderer/preload/course";
import { IOllamaAPI } from "./renderer/preload/ollama";
import { IModelAPI } from "./renderer/preload/model";
import { IConfigAPI } from "./renderer/preload/config";
import { ISearchAPI } from "./renderer/preload/search";
import { IFileUploadAPI } from "./renderer/preload/fileUpload";
import { IContextAPI } from "./renderer/preload/context";

export interface IErrorAPI {
  getProcessStatuses: () => Promise<any>;
  getProcessStatus: (processName: string) => Promise<any>;
  restartProcess: (processName: string) => Promise<any>;
  resetRestartAttempts: (processName: string) => Promise<any>;
  getLogPath: () => Promise<any>;
  openLogs: () => Promise<any>;
  onMaxAttemptsExceeded: (callback: (data: any) => void) => () => void;
  onError: (callback: (error: any) => void) => () => void;
}

export interface IStartupAPI {
  onStartupProgress: (callback: (progress: {
    status: string;
    message: string;
    progress: number;
    error?: string;
  }) => void) => () => void;
  getStartupStatus: () => Promise<string>;
  isReady: () => Promise<boolean>;
}

export interface IAPI {
  message: IMessageAPI;
  chat: IChatAPI;
  document: IDocumentAPI;
  course: ICourseAPI;
  ollama: IOllamaAPI;
  model: IModelAPI;
  config: IConfigAPI;
  error: IErrorAPI;
  startup: IStartupAPI;
  search: ISearchAPI;
  fileUpload: IFileUploadAPI;
  context: IContextAPI;
}

declare global {
  interface Window {
    api: IAPI;
  }

  type DocType = "pdf" | "docx" | "pptx" | "other";

  interface Doc {
    id: string;
    courseId: string;
    chatId: string;
    title: string;
    path: string;
    docType: DocType;
  }

  interface ChatType {
    id: string;
    title: string;
    latestActivity: Date;
    chatType: "direct" | "document-based";
    documentIds?: string[];
  }

  interface Message {
    content: string;
    sender: "human" | "bot";
    citations: Citation[];
    timestamp?: string;
    documentIds?: string[];
  }

  interface Citation {
    documentTitle: string;
    text: string;
  }

  type Course = Course;

  type ModelID =
    // LLM Models
    | "gpt-oss:20b"
    | "gpt-oss:120b"
    | "qwen3:8b"
    | "qwen3:4b"
    | "llama3.1:8b"
    | "llama3.2:3b"
    | "phi4:14b"
    | "phi4-mini:3.8b"
    | "gemma3:4b"
    | "gemma3n:e4b"
    | "mistral:7b"
    | "mistral-nemo:12b"
    | "deepseek-r1:8b"
    | "deepseek-v2:16b"
    | "dolphin3:8b"
    | "codellama:13b"
    // Embedding Models
    | "nomic-embed-text:v1.5"
    | "mxbai-embed-large:335m"
    | "embeddinggemma:300m"
    | "bge-m3:567m"
    | "all-minilm:33m"
    | "snowflake-arctic-embed:335m";

  type ModelStatus = "downloading" | "downloaded" | "not downloaded";

  export type ModelType = "llm" | "embedding";

  /**
   * Model description
   * @param id - The name of the model in ollama including the parameter size
   * @param name - The name of the model. Not related to ollama name
   * @param description - A brief description of the model
   * @param size - The size of the model in MB
   * @param minimumRAM - The minimum RAM required to run the model in GB
   */
  type ModelDescription = {
    id: ModelID;
    name: string;
    description: string;
    size: number;
    minimumRAM: number;
    type: ModelType;
  };

  type Model = {
    id: ModelID;
    status: ModelStatus;
    description: ModelDescription;
    isSelectedLlm: boolean;
    isSelectedEmbedding: boolean;
  };

  interface Excerpt {
    text: string;
    documentTitle: string;
    courseId: string;
    chatId: string;
    documentId: string;
    embeddings: number[];
  }

  type DocumentImportState = Array<{
    stage: DocumentImportStage;
    progress: DocumentImportProgress;
    completed?: number;
    total?: number;
  }>;

  type DocumentImportStage =
    | "Initialize"
    | "Parse"
    | "Split"
    | "Embed"
    | "Save Excerpts";
  type DocumentImportProgress = "Not Started" | "In Progress" | "Finished";
}
