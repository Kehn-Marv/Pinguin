import logger from "electron-log";
import DocumentStorage from "./DocumentStorage";
import DocumentMetadataManager from "./DocumentMetadata";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

/**
 * DocumentDeletion handles complete document deletion including:
 * - Physical file deletion
 * - ChromaDB chunk removal
 * - Metadata cleanup
 */
class DocumentDeletion {
  private static instance: DocumentDeletion | null = null;
  private storage: DocumentStorage;
  private metadataManager: DocumentMetadataManager;
  private pythonBackendUrl: string;

  private constructor() {
    this.storage = DocumentStorage.getInstance();
    this.metadataManager = DocumentMetadataManager.getInstance();
    this.pythonBackendUrl = "http://localhost:8000";
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DocumentDeletion {
    if (!DocumentDeletion.instance) {
      DocumentDeletion.instance = new DocumentDeletion();
    }
    return DocumentDeletion.instance;
  }

  /**
   * Set Python backend URL
   */
  public setPythonBackendUrl(url: string): void {
    this.pythonBackendUrl = url;
    logger.info(`Python backend URL set to: ${url}`);
  }

  /**
   * Delete document completely
   * @param docId Document ID
   * @param skipConfirmation Skip user confirmation (for programmatic deletion)
   * @returns Success status
   */
  public async deleteDocument(
    docId: string,
    skipConfirmation = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info(`Starting deletion process for document ${docId}`);

      // Get metadata
      const metadata = this.metadataManager.getMetadata(docId);
      if (!metadata) {
        logger.warn(`Document ${docId} not found in metadata`);
        return { success: false, error: "Document not found" };
      }

      // Step 1: Remove chunks from ChromaDB
      try {
        await this.removeChunksFromChromaDB(docId);
        logger.info(`Removed chunks from ChromaDB for document ${docId}`);
      } catch (error) {
        logger.error(`Failed to remove chunks from ChromaDB:`, error);
        // Continue with deletion even if ChromaDB cleanup fails
      }

      // Step 2: Delete physical file
      try {
        this.storage.deleteDocument(metadata.filepath);
        logger.info(`Deleted physical file for document ${docId}`);
      } catch (error) {
        logger.error(`Failed to delete physical file:`, error);
        // Continue with metadata cleanup
      }

      // Step 3: Remove metadata
      this.metadataManager.deleteMetadata(docId);
      logger.info(`Removed metadata for document ${docId}`);

      logger.info(`Successfully deleted document ${docId}`);
      return { success: true };
    } catch (error: unknown) {
      logger.error(`Failed to delete document ${docId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during deletion",
      };
    }
  }

  /**
   * Remove document chunks from ChromaDB via Python backend
   */
  private async removeChunksFromChromaDB(docId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.pythonBackendUrl}/documents/${docId}`);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 8000,
        path: url.pathname,
        method: "DELETE",
        timeout: 10000,
      };

      const req = http.request(options, (res) => {
        res.on("data", () => {
          // Consume data
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            logger.info(`ChromaDB chunks removed for document ${docId}`);
            resolve();
          } else {
            reject(new Error(`ChromaDB deletion failed with status ${res.statusCode}`));
          }
        });
      });

      req.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ECONNREFUSED") {
          logger.warn("Python backend not available, skipping ChromaDB cleanup");
          resolve();
        } else {
          reject(new Error(`ChromaDB deletion failed: ${error.message}`));
        }
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("ChromaDB deletion request timed out"));
      });

      req.end();
    });
  }

  /**
   * Delete multiple documents
   */
  public async deleteMultipleDocuments(
    docIds: string[]
  ): Promise<{ success: boolean; results: Record<string, boolean> }> {
    logger.info(`Deleting ${docIds.length} documents`);
    const results: Record<string, boolean> = {};

    for (const docId of docIds) {
      const result = await this.deleteDocument(docId, true);
      results[docId] = result.success;
    }

    const successCount = Object.values(results).filter((r) => r).length;
    logger.info(`Deleted ${successCount}/${docIds.length} documents successfully`);

    return {
      success: successCount === docIds.length,
      results,
    };
  }

  /**
   * Delete all documents for a course
   */
  public async deleteDocumentsByCourse(
    courseId: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    logger.info(`Deleting all documents for course ${courseId}`);

    const documents = this.metadataManager.getMetadataByCourse(courseId);
    const docIds = documents.map((doc) => doc.id);

    if (docIds.length === 0) {
      logger.info(`No documents found for course ${courseId}`);
      return { success: true, deletedCount: 0 };
    }

    const result = await this.deleteMultipleDocuments(docIds);
    const deletedCount = Object.values(result.results).filter((r) => r).length;

    return { success: result.success, deletedCount };
  }

  /**
   * Clean up orphaned files (files without metadata)
   */
  public async cleanupOrphanedFiles(): Promise<{
    success: boolean;
    cleanedCount: number;
  }> {
    logger.info("Starting orphaned file cleanup");
    let cleanedCount = 0;

    try {
      const storageDir = this.storage.getStorageDir();
      const files = fs.readdirSync(storageDir);

      for (const file of files) {
        // Extract doc ID from filename (format: docId.ext.enc)
        const docId = file.split(".")[0];
        const metadata = this.metadataManager.getMetadata(docId);

        if (!metadata) {
          // Orphaned file found
          const filePath = path.join(storageDir, file);
          try {
            fs.unlinkSync(filePath);
            cleanedCount++;
            logger.info(`Cleaned up orphaned file: ${file}`);
          } catch (error) {
            logger.error(`Failed to delete orphaned file ${file}:`, error);
          }
        }
      }

      logger.info(`Cleaned up ${cleanedCount} orphaned files`);
      return { success: true, cleanedCount };
    } catch (error) {
      logger.error("Failed to cleanup orphaned files:", error);
      return { success: false, cleanedCount };
    }
  }

  /**
   * Clean up failed documents (status = failed)
   */
  public async cleanupFailedDocuments(): Promise<{
    success: boolean;
    cleanedCount: number;
  }> {
    logger.info("Cleaning up failed documents");

    const failedDocs = this.metadataManager.getByStatus("failed");
    const docIds = failedDocs.map((doc) => doc.id);

    if (docIds.length === 0) {
      logger.info("No failed documents to clean up");
      return { success: true, cleanedCount: 0 };
    }

    const result = await this.deleteMultipleDocuments(docIds);
    const cleanedCount = Object.values(result.results).filter((r) => r).length;

    logger.info(`Cleaned up ${cleanedCount} failed documents`);
    return { success: result.success, cleanedCount };
  }
}

export default DocumentDeletion;
