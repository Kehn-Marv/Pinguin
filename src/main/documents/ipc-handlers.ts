import { ipcMain, dialog } from "electron";
import logger from "electron-log";
import DocumentManager from "./DocumentManager";
import { ProcessingStatus } from "./DocumentMetadata";
import FileUploadManager from "./fileUploadManager";

/**
 * Helper to get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Register IPC handlers for document management
 */
export function registerDocumentIPCHandlers(): void {
  const documentManager = DocumentManager.getInstance();

  /**
   * Upload document
   */
  ipcMain.handle(
    "document:upload",
    async (_event, filePath: string, courseId?: string, checkDuplicates = true) => {
      try {
        logger.info(`IPC: Uploading document ${filePath}`);
        const result = await documentManager.uploadDocument(
          filePath,
          courseId,
          checkDuplicates
        );
        return result;
      } catch (error) {
        logger.error("IPC: Failed to upload document:", error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );

  /**
   * Get document metadata
   */
  ipcMain.handle("document:getMetadata", async (_event, docId: string) => {
    try {
      logger.info(`IPC: Getting metadata for document ${docId}`);
      const metadata = documentManager.getDocument(docId);
      return { success: true, metadata };
    } catch (error) {
      logger.error("IPC: Failed to get document metadata:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get all documents
   */
  ipcMain.handle("document:getAll", async () => {
    try {
      logger.info("IPC: Getting all documents");
      const documents = documentManager.getAllDocuments();
      return { success: true, documents };
    } catch (error) {
      logger.error("IPC: Failed to get all documents:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get documents by course
   */
  ipcMain.handle("document:getByCourse", async (_event, courseId: string) => {
    try {
      logger.info(`IPC: Getting documents for course ${courseId}`);
      const documents = documentManager.getDocumentsByCourse(courseId);
      return { success: true, documents };
    } catch (error) {
      logger.error("IPC: Failed to get documents by course:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Delete document with confirmation
   */
  ipcMain.handle("document:deleteWithConfirm", async (_event, docId: string) => {
    try {
      logger.info(`IPC: Delete request for document ${docId}`);
      
      // Get document metadata for confirmation dialog
      const metadata = documentManager.getDocument(docId);
      if (!metadata) {
        return { success: false, error: "Document not found" };
      }

      // Show confirmation dialog
      const result = await dialog.showMessageBox({
        type: "warning",
        title: "Delete Document",
        message: `Are you sure you want to delete "${metadata.filename}"?`,
        detail: "This action cannot be undone. The document and all its data will be permanently removed.",
        buttons: ["Cancel", "Delete"],
        defaultId: 0,
        cancelId: 0,
      });

      if (result.response === 1) {
        // User confirmed deletion
        return await documentManager.deleteDocument(docId);
      } else {
        // User cancelled
        return { success: false, error: "Deletion cancelled by user" };
      }
    } catch (error) {
      logger.error("IPC: Failed to delete document:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Delete document without confirmation (for programmatic use)
   */
  ipcMain.handle("document:delete", async (_event, docId: string) => {
    try {
      logger.info(`IPC: Deleting document ${docId} (no confirmation)`);
      return await documentManager.deleteDocument(docId);
    } catch (error) {
      logger.error("IPC: Failed to delete document:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Delete multiple documents
   */
  ipcMain.handle("document:deleteMultiple", async (_event, docIds: string[]) => {
    try {
      logger.info(`IPC: Deleting ${docIds.length} documents`);
      return await documentManager.deleteMultipleDocuments(docIds);
    } catch (error) {
      logger.error("IPC: Failed to delete multiple documents:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Check for duplicate
   */
  ipcMain.handle("document:checkDuplicate", async (_event, filePath: string, courseId?: string) => {
    try {
      logger.info(`IPC: Checking duplicate for ${filePath}`);
      const result = courseId
        ? documentManager.checkDuplicateInCourse(filePath, courseId)
        : documentManager.checkDuplicate(filePath);
      return { success: true, result };
    } catch (error) {
      logger.error("IPC: Failed to check duplicate:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get duplicate statistics
   */
  ipcMain.handle("document:getDuplicateStats", async () => {
    try {
      logger.info("IPC: Getting duplicate statistics");
      const stats = documentManager.getDuplicateStats();
      return { success: true, stats };
    } catch (error) {
      logger.error("IPC: Failed to get duplicate stats:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Find all duplicates
   */
  ipcMain.handle("document:findAllDuplicates", async () => {
    try {
      logger.info("IPC: Finding all duplicates");
      const duplicates = documentManager.findAllDuplicates();
      return { success: true, duplicates };
    } catch (error) {
      logger.error("IPC: Failed to find duplicates:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get storage statistics
   */
  ipcMain.handle("document:getStorageStats", async () => {
    try {
      logger.info("IPC: Getting storage statistics");
      const stats = documentManager.getStorageStats();
      return { success: true, stats };
    } catch (error) {
      logger.error("IPC: Failed to get storage stats:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Update processing status
   */
  ipcMain.handle(
    "document:updateProcessingStatus",
    async (_event, docId: string, status: string, errorMessage?: string) => {
      try {
        logger.info(`IPC: Updating processing status for ${docId} to ${status}`);
        documentManager.updateProcessingStatus(docId, status as ProcessingStatus, errorMessage);
        return { success: true };
      } catch (error) {
        logger.error("IPC: Failed to update processing status:", error);
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );

  /**
   * Update chunk count
   */
  ipcMain.handle(
    "document:updateChunkCount",
    async (_event, docId: string, chunkCount: number) => {
      try {
        logger.info(`IPC: Updating chunk count for ${docId} to ${chunkCount}`);
        documentManager.updateChunkCount(docId, chunkCount);
        return { success: true };
      } catch (error) {
        logger.error("IPC: Failed to update chunk count:", error);
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );

  /**
   * Update page count
   */
  ipcMain.handle(
    "document:updatePageCount",
    async (_event, docId: string, pageCount: number) => {
      try {
        logger.info(`IPC: Updating page count for ${docId} to ${pageCount}`);
        documentManager.updatePageCount(docId, pageCount);
        return { success: true };
      } catch (error) {
        logger.error("IPC: Failed to update page count:", error);
        return { success: false, error: getErrorMessage(error) };
      }
    }
  );

  /**
   * Cleanup orphaned files
   */
  ipcMain.handle("document:cleanupOrphaned", async () => {
    try {
      logger.info("IPC: Cleaning up orphaned files");
      return await documentManager.cleanupOrphanedFiles();
    } catch (error) {
      logger.error("IPC: Failed to cleanup orphaned files:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Cleanup failed documents
   */
  ipcMain.handle("document:cleanupFailed", async () => {
    try {
      logger.info("IPC: Cleaning up failed documents");
      return await documentManager.cleanupFailedDocuments();
    } catch (error) {
      logger.error("IPC: Failed to cleanup failed documents:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Set Python backend URL
   */
  ipcMain.handle("document:setPythonBackendUrl", async (_event, url: string) => {
    try {
      logger.info(`IPC: Setting Python backend URL to ${url}`);
      documentManager.setPythonBackendUrl(url);
      return { success: true };
    } catch (error) {
      logger.error("IPC: Failed to set Python backend URL:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  logger.info("Document IPC handlers registered");
}

/**
 * Register IPC handlers for file upload management
 */
export function registerFileUploadIPCHandlers(): void {
  const fileUploadManager = FileUploadManager.getInstance();

  /**
   * Select files using dialog
   */
  ipcMain.handle("file:selectFiles", async () => {
    try {
      logger.info("IPC: Opening file selection dialog");
      const result = await dialog.showOpenDialog({
        title: "Select files",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "All Supported Files", extensions: ["pdf", "docx", "pptx", "epub", "txt", "md", "png", "jpg", "jpeg", "gif", "webp"] },
          { name: "Documents", extensions: ["pdf", "docx", "pptx", "epub", "txt", "md"] },
          { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      
      if (result.canceled) {
        return { success: true, filePaths: [] };
      }
      
      return { success: true, filePaths: result.filePaths };
    } catch (error) {
      logger.error("IPC: Failed to select files:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Upload file with instant feedback
   */
  ipcMain.handle(
    "file:upload",
    async (_event, courseId: string, chatId: string, filePath: string) => {
      try {
        logger.info(`IPC: Uploading file ${filePath} for chat ${chatId}`);
        const uploadState = await fileUploadManager.uploadFile(
          courseId,
          chatId,
          filePath
        );
        return { success: true, uploadState };
      } catch (error) {
        logger.error("IPC: Failed to upload file:", error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );

  /**
   * Get upload state
   */
  ipcMain.handle("file:getUploadState", async (_event, fileId: string) => {
    try {
      logger.info(`IPC: Getting upload state for ${fileId}`);
      const uploadState = fileUploadManager.getUploadState(fileId);
      return { success: true, uploadState };
    } catch (error) {
      logger.error("IPC: Failed to get upload state:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get upload states by chat
   */
  ipcMain.handle("file:getUploadStatesByChat", async (_event, chatId: string) => {
    try {
      logger.info(`IPC: Getting upload states for chat ${chatId}`);
      const uploadStates = fileUploadManager.getUploadStatesByChat(chatId);
      return { success: true, uploadStates };
    } catch (error) {
      logger.error("IPC: Failed to get upload states by chat:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Retry failed upload
   */
  ipcMain.handle(
    "file:retryUpload",
    async (_event, fileId: string, filePath: string) => {
      try {
        logger.info(`IPC: Retrying upload for ${fileId}`);
        const uploadState = await fileUploadManager.retryUpload(fileId, filePath);
        return { success: true, uploadState };
      } catch (error) {
        logger.error("IPC: Failed to retry upload:", error);
        return {
          success: false,
          error: getErrorMessage(error),
        };
      }
    }
  );

  /**
   * Cancel upload
   */
  ipcMain.handle("file:cancelUpload", async (_event, fileId: string) => {
    try {
      logger.info(`IPC: Cancelling upload for ${fileId}`);
      fileUploadManager.cancelUpload(fileId);
      return { success: true };
    } catch (error) {
      logger.error("IPC: Failed to cancel upload:", error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  logger.info("File upload IPC handlers registered");
}
