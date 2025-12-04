import * as crypto from "crypto";
import * as fs from "fs";
import Store from "electron-store";
import logger from "electron-log";

/**
 * Document processing status
 */
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Document metadata interface
 */
export interface DocumentMetadata {
  id: string;
  filename: string;
  filepath: string;
  fileType: "pdf" | "docx" | "pptx" | "epub" | "txt" | "other";
  fileSize: number; // bytes
  uploadDate: Date;
  pageCount?: number;
  chunkCount: number;
  contentHash: string; // SHA-256 for deduplication
  processingStatus: ProcessingStatus;
  errorMessage?: string;
  courseId?: string; // For compatibility with existing system
}

/**
 * DocumentMetadataManager handles CRUD operations for document metadata
 * Uses electron-store for persistence
 */
class DocumentMetadataManager {
  private static instance: DocumentMetadataManager | null = null;
  private store: Store<{ documents: Record<string, DocumentMetadata> }>;

  private constructor() {
    this.store = new Store<{ documents: Record<string, DocumentMetadata> }>({
      name: "document-metadata",
      defaults: {
        documents: {},
      },
    });
    logger.info("DocumentMetadataManager initialized");
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DocumentMetadataManager {
    if (!DocumentMetadataManager.instance) {
      DocumentMetadataManager.instance = new DocumentMetadataManager();
    }
    return DocumentMetadataManager.instance;
  }

  /**
   * Calculate SHA-256 hash of file content
   */
  public calculateContentHash(filePath: string): string {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const hash = crypto.createHash("sha256");
      hash.update(fileBuffer as any);
      return hash.digest("hex");
    } catch (error: unknown) {
      logger.error(`Failed to calculate content hash for ${filePath}:`, error);
      throw new Error(`Failed to calculate content hash: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Create new document metadata
   */
  public createMetadata(
    id: string,
    filename: string,
    filepath: string,
    fileType: DocumentMetadata["fileType"],
    fileSize: number,
    contentHash: string,
    courseId?: string
  ): DocumentMetadata {
    const metadata: DocumentMetadata = {
      id,
      filename,
      filepath,
      fileType,
      fileSize,
      uploadDate: new Date(),
      chunkCount: 0,
      contentHash,
      processingStatus: "pending",
      courseId,
    };

    this.saveMetadata(metadata);
    logger.info(`Created metadata for document ${id}`);
    return metadata;
  }

  /**
   * Save or update document metadata
   */
  public saveMetadata(metadata: DocumentMetadata): void {
    const documents = this.store.get("documents");
    documents[metadata.id] = metadata;
    this.store.set("documents", documents);
    logger.info(`Saved metadata for document ${metadata.id}`);
  }

  /**
   * Get document metadata by ID
   */
  public getMetadata(docId: string): DocumentMetadata | null {
    const documents = this.store.get("documents");
    return documents[docId] || null;
  }

  /**
   * Get all document metadata
   */
  public getAllMetadata(): DocumentMetadata[] {
    const documents = this.store.get("documents");
    return Object.values(documents) as DocumentMetadata[];
  }

  /**
   * Get documents by course ID
   */
  public getMetadataByCourse(courseId: string): DocumentMetadata[] {
    const documents = this.store.get("documents");
    return (Object.values(documents) as DocumentMetadata[]).filter((doc) => doc.courseId === courseId);
  }

  /**
   * Update document metadata
   */
  public updateMetadata(
    docId: string,
    updates: Partial<DocumentMetadata>
  ): DocumentMetadata | null {
    const metadata = this.getMetadata(docId);
    if (!metadata) {
      logger.warn(`Document ${docId} not found for update`);
      return null;
    }

    const updatedMetadata = { ...metadata, ...updates };
    this.saveMetadata(updatedMetadata);
    logger.info(`Updated metadata for document ${docId}`);
    return updatedMetadata;
  }

  /**
   * Update processing status
   */
  public updateProcessingStatus(
    docId: string,
    status: ProcessingStatus,
    errorMessage?: string
  ): void {
    const updates: Partial<DocumentMetadata> = {
      processingStatus: status,
    };

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    this.updateMetadata(docId, updates);
  }

  /**
   * Update chunk count
   */
  public updateChunkCount(docId: string, chunkCount: number): void {
    this.updateMetadata(docId, { chunkCount });
  }

  /**
   * Update page count
   */
  public updatePageCount(docId: string, pageCount: number): void {
    this.updateMetadata(docId, { pageCount });
  }

  /**
   * Delete document metadata
   */
  public deleteMetadata(docId: string): boolean {
    const documents = this.store.get("documents");
    if (documents[docId]) {
      delete documents[docId];
      this.store.set("documents", documents);
      logger.info(`Deleted metadata for document ${docId}`);
      return true;
    }
    logger.warn(`Document ${docId} not found for deletion`);
    return false;
  }

  /**
   * Check if document with content hash already exists
   */
  public findByContentHash(contentHash: string): DocumentMetadata | null {
    const documents = this.store.get("documents");
    const existing = (Object.values(documents) as DocumentMetadata[]).find(
      (doc) => doc.contentHash === contentHash
    );
    return existing || null;
  }

  /**
   * Get documents by processing status
   */
  public getByStatus(status: ProcessingStatus): DocumentMetadata[] {
    const documents = this.store.get("documents");
    return (Object.values(documents) as DocumentMetadata[]).filter(
      (doc) => doc.processingStatus === status
    );
  }

  /**
   * Get total storage size of all documents
   */
  public getTotalStorageSize(): number {
    const documents = this.store.get("documents");
    return (Object.values(documents) as DocumentMetadata[]).reduce(
      (total, doc) => total + doc.fileSize,
      0
    );
  }

  /**
   * Get document count
   */
  public getDocumentCount(): number {
    const documents = this.store.get("documents");
    return Object.keys(documents).length;
  }

  /**
   * Clear all metadata (use with caution)
   */
  public clearAll(): void {
    this.store.set("documents", {});
    logger.warn("Cleared all document metadata");
  }

  /**
   * Export metadata to JSON
   */
  public exportMetadata(): Record<string, DocumentMetadata> {
    return this.store.get("documents");
  }

  /**
   * Import metadata from JSON
   */
  public importMetadata(data: Record<string, DocumentMetadata>): void {
    this.store.set("documents", data);
    logger.info(`Imported ${Object.keys(data).length} document metadata entries`);
  }
}

export default DocumentMetadataManager;
