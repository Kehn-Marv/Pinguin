import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";
import logger from "electron-log";
import DocumentStorage from "./DocumentStorage";
import DocumentMetadataManager, {
  DocumentMetadata,
  ProcessingStatus,
} from "./DocumentMetadata";
import DocumentDeletion from "./DocumentDeletion";
import DuplicateDetection, { DuplicateCheckResult } from "./DuplicateDetection";

/**
 * Result of document upload operation
 */
export interface UploadResult {
  success: boolean;
  documentId?: string;
  metadata?: DocumentMetadata;
  error?: string;
  isDuplicate?: boolean;
  existingDocument?: DocumentMetadata;
}

/**
 * DocumentManager provides a unified API for document management
 * Integrates storage, metadata, deletion, and duplicate detection
 */
class DocumentManager {
  private static instance: DocumentManager | null = null;
  private storage: DocumentStorage;
  private metadataManager: DocumentMetadataManager;
  private deletion: DocumentDeletion;
  private duplicateDetection: DuplicateDetection;

  private constructor() {
    this.storage = DocumentStorage.getInstance();
    this.metadataManager = DocumentMetadataManager.getInstance();
    this.deletion = DocumentDeletion.getInstance();
    this.duplicateDetection = DuplicateDetection.getInstance();
    logger.info("DocumentManager initialized");
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DocumentManager {
    if (!DocumentManager.instance) {
      DocumentManager.instance = new DocumentManager();
    }
    return DocumentManager.instance;
  }

  /**
   * Upload and store a document
   * @param filePath Path to source file
   * @param courseId Optional course ID
   * @param checkDuplicates Whether to check for duplicates (default: true)
   * @returns Upload result
   */
  public async uploadDocument(
    filePath: string,
    courseId?: string,
    checkDuplicates = true
  ): Promise<UploadResult> {
    try {
      logger.info(`Uploading document: ${filePath}`);

      // Check for duplicates if enabled
      if (checkDuplicates) {
        const duplicateCheck = courseId
          ? this.duplicateDetection.checkDuplicateInCourse(filePath, courseId)
          : this.duplicateDetection.checkDuplicate(filePath);

        if (duplicateCheck.isDuplicate) {
          logger.warn(`Duplicate document detected: ${filePath}`);
          return {
            success: false,
            error: duplicateCheck.message,
            isDuplicate: true,
            existingDocument: duplicateCheck.existingDocument,
          };
        }
      }

      // Generate document ID
      const docId = uuidv4();

      // Determine file type
      const extension = path.extname(filePath).toLowerCase();
      const fileType = this.getFileType(extension);

      // Get file size
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // Calculate content hash
      const contentHash = this.metadataManager.calculateContentHash(filePath);

      // Save document with encryption
      const storedPath = this.storage.saveDocument(docId, filePath);

      // Create metadata
      const filename = path.basename(filePath);
      const metadata = this.metadataManager.createMetadata(
        docId,
        filename,
        storedPath,
        fileType,
        fileSize,
        contentHash,
        courseId
      );

      logger.info(`Document uploaded successfully: ${docId}`);
      return {
        success: true,
        documentId: docId,
        metadata,
      };
    } catch (error: unknown) {
      logger.error(`Failed to upload document:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during upload",
      };
    }
  }

  /**
   * Get file type from extension
   */
  private getFileType(
    extension: string
  ): DocumentMetadata["fileType"] {
    switch (extension) {
      case ".pdf":
        return "pdf";
      case ".docx":
        return "docx";
      case ".pptx":
        return "pptx";
      case ".epub":
        return "epub";
      case ".txt":
        return "txt";
      default:
        return "other";
    }
  }

  /**
   * Get document metadata
   */
  public getDocument(docId: string): DocumentMetadata | null {
    return this.metadataManager.getMetadata(docId);
  }

  /**
   * Get all documents
   */
  public getAllDocuments(): DocumentMetadata[] {
    return this.metadataManager.getAllMetadata();
  }

  /**
   * Get documents by course
   */
  public getDocumentsByCourse(courseId: string): DocumentMetadata[] {
    return this.metadataManager.getMetadataByCourse(courseId);
  }

  /**
   * Update document processing status
   */
  public updateProcessingStatus(
    docId: string,
    status: ProcessingStatus,
    errorMessage?: string
  ): void {
    this.metadataManager.updateProcessingStatus(docId, status, errorMessage);
  }

  /**
   * Update document chunk count
   */
  public updateChunkCount(docId: string, chunkCount: number): void {
    this.metadataManager.updateChunkCount(docId, chunkCount);
  }

  /**
   * Update document page count
   */
  public updatePageCount(docId: string, pageCount: number): void {
    this.metadataManager.updatePageCount(docId, pageCount);
  }

  /**
   * Delete document
   */
  public async deleteDocument(
    docId: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.deletion.deleteDocument(docId);
  }

  /**
   * Delete multiple documents
   */
  public async deleteMultipleDocuments(
    docIds: string[]
  ): Promise<{ success: boolean; results: Record<string, boolean> }> {
    return this.deletion.deleteMultipleDocuments(docIds);
  }

  /**
   * Delete all documents for a course
   */
  public async deleteDocumentsByCourse(
    courseId: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    return this.deletion.deleteDocumentsByCourse(courseId);
  }

  /**
   * Check if document is duplicate
   */
  public checkDuplicate(filePath: string): DuplicateCheckResult {
    return this.duplicateDetection.checkDuplicate(filePath);
  }

  /**
   * Check if document is duplicate in course
   */
  public checkDuplicateInCourse(
    filePath: string,
    courseId: string
  ): DuplicateCheckResult {
    return this.duplicateDetection.checkDuplicateInCourse(filePath, courseId);
  }

  /**
   * Get duplicate statistics
   */
  public getDuplicateStats() {
    return this.duplicateDetection.getDuplicateStats();
  }

  /**
   * Find all duplicate documents
   */
  public findAllDuplicates(): DocumentMetadata[][] {
    return this.duplicateDetection.findAllDuplicates();
  }

  /**
   * Get storage statistics
   */
  public getStorageStats(): {
    totalDocuments: number;
    totalSize: number;
    storageDir: string;
  } {
    return {
      totalDocuments: this.metadataManager.getDocumentCount(),
      totalSize: this.metadataManager.getTotalStorageSize(),
      storageDir: this.storage.getStorageDir(),
    };
  }

  /**
   * Clean up orphaned files
   */
  public async cleanupOrphanedFiles(): Promise<{
    success: boolean;
    cleanedCount: number;
  }> {
    return this.deletion.cleanupOrphanedFiles();
  }

  /**
   * Clean up failed documents
   */
  public async cleanupFailedDocuments(): Promise<{
    success: boolean;
    cleanedCount: number;
  }> {
    return this.deletion.cleanupFailedDocuments();
  }

  /**
   * Load and decrypt document to temporary location
   */
  public loadDocument(
    docId: string,
    outputPath: string
  ): string | null {
    try {
      const metadata = this.metadataManager.getMetadata(docId);
      if (!metadata) {
        logger.error(`Document ${docId} not found`);
        return null;
      }

      return this.storage.loadDocument(docId, metadata.filepath, outputPath);
    } catch (error) {
      logger.error(`Failed to load document ${docId}:`, error);
      return null;
    }
  }

  /**
   * Set Python backend URL for deletion operations
   */
  public setPythonBackendUrl(url: string): void {
    this.deletion.setPythonBackendUrl(url);
  }
}

export default DocumentManager;
