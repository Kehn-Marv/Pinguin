import { ipcRenderer } from "electron";

/**
 * File upload state interface
 */
export interface FileUploadState {
  fileId: string;
  documentId?: string; // The actual document ID stored in ChromaDB
  chatId: string;
  courseId: string;
  filename: string;
  filePath: string; // Store original file path for retry
  fileType: string;
  fileSize: number;
  status: "pending" | "uploading" | "processing" | "complete" | "error";
  progress: number; // 0-100
  thumbnailPath?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const fileUpload = {
  /**
   * Select files using dialog
   */
  selectFiles: async (): Promise<{ success: boolean; filePaths?: string[]; error?: string }> => {
    return ipcRenderer.invoke("file:selectFiles");
  },

  /**
   * Upload a file with instant feedback
   */
  upload: async (
    courseId: string,
    chatId: string,
    filePath: string
  ): Promise<{ success: boolean; uploadState?: FileUploadState; error?: string }> => {
    return ipcRenderer.invoke("file:upload", courseId, chatId, filePath);
  },

  /**
   * Get upload state for a file
   */
  getUploadState: async (
    fileId: string
  ): Promise<{ success: boolean; uploadState?: FileUploadState; error?: string }> => {
    return ipcRenderer.invoke("file:getUploadState", fileId);
  },

  /**
   * Get all upload states for a chat
   */
  getUploadStatesByChat: async (
    chatId: string
  ): Promise<{ success: boolean; uploadStates?: FileUploadState[]; error?: string }> => {
    return ipcRenderer.invoke("file:getUploadStatesByChat", chatId);
  },

  /**
   * Retry a failed upload
   */
  retryUpload: async (
    fileId: string,
    filePath: string
  ): Promise<{ success: boolean; uploadState?: FileUploadState; error?: string }> => {
    return ipcRenderer.invoke("file:retryUpload", fileId, filePath);
  },

  /**
   * Cancel an ongoing upload
   */
  cancelUpload: async (
    fileId: string
  ): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("file:cancelUpload", fileId);
  },

  /**
   * Subscribe to upload state changes for a specific file
   */
  subscribeToUploadState: (
    fileId: string,
    callback: (uploadState: FileUploadState) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, uploadState: FileUploadState) => {
      callback(uploadState);
    };
    ipcRenderer.on(`file:upload:state:${fileId}`, listener);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(`file:upload:state:${fileId}`, listener);
    };
  },

  /**
   * Subscribe to upload cancellation for a specific file
   */
  subscribeToUploadCancelled: (
    fileId: string,
    callback: () => void
  ): (() => void) => {
    const listener = () => {
      callback();
    };
    ipcRenderer.on(`file:upload:cancelled:${fileId}`, listener);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(`file:upload:cancelled:${fileId}`, listener);
    };
  },
};

export type IFileUploadAPI = typeof fileUpload;
export default fileUpload;
