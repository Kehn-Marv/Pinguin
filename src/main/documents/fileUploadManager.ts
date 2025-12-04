import { app, webContents } from "electron";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import logger from "electron-log";
import documentsDB from "./documentsDB";
import PerformanceMonitor from "../utils/performanceMonitor";
import axios from "axios";

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

/**
 * FileUploadManager handles file uploads with instant UI feedback and background processing
 */
class FileUploadManager {
  private static instance: FileUploadManager | null = null;
  private uploadStates: Map<string, FileUploadState> = new Map();

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): FileUploadManager {
    if (!FileUploadManager.instance) {
      FileUploadManager.instance = new FileUploadManager();
    }
    return FileUploadManager.instance;
  }

  /**
   * Initiates file upload with immediate UI feedback
   * @param courseId - Course ID
   * @param chatId - Chat ID
   * @param filePath - Path to file
   * @returns Upload state
   */
  public async uploadFile(
    courseId: string,
    chatId: string,
    filePath: string
  ): Promise<FileUploadState> {
    const fileId = uuidv4();
    const filename = path.basename(filePath);
    const fileType = this.getFileType(filePath);
    const fileSize = this.getFileSize(filePath);

    // Create initial upload state
    const uploadState: FileUploadState = {
      fileId,
      chatId,
      courseId,
      filename,
      filePath, // Store for retry functionality
      fileType,
      fileSize,
      status: "pending",
      progress: 0,
      startedAt: new Date(),
    };

    this.uploadStates.set(fileId, uploadState);
    this.notifyUploadStateChange(fileId, uploadState);

    try {
      // Generate thumbnail for images immediately
      if (this.isImageFile(fileType)) {
        const thumbnailPath = await this.generateThumbnail(filePath, fileId);
        uploadState.thumbnailPath = thumbnailPath;
        uploadState.status = "uploading";
        uploadState.progress = 10;
        this.uploadStates.set(fileId, uploadState);
        this.notifyUploadStateChange(fileId, uploadState);
      } else {
        uploadState.status = "uploading";
        uploadState.progress = 5;
        this.uploadStates.set(fileId, uploadState);
        this.notifyUploadStateChange(fileId, uploadState);
      }

      // Start background processing (non-blocking)
      this.processFileBackground(fileId, filePath, courseId, chatId).catch(
        (error) => {
          logger.error(`Background processing failed for ${fileId}:`, error);
          this.handleUploadError(fileId, error.message);
        }
      );

      return uploadState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error initiating upload for ${filename}:`, error);
      this.handleUploadError(fileId, errorMessage);
      const state = this.uploadStates.get(fileId);
      if (!state) {
        throw new Error(`Upload state not found for ${fileId}`);
      }
      return state;
    }
  }

  /**
   * Processes file in background
   * @param fileId - File upload ID
   * @param filePath - Path to file
   * @param courseId - Course ID
   * @param chatId - Chat ID
   */
  private async processFileBackground(
    fileId: string,
    filePath: string,
    courseId: string,
    chatId: string
  ): Promise<void> {
    const uploadState = this.uploadStates.get(fileId);
    if (!uploadState) {
      throw new Error(`Upload state not found for ${fileId}`);
    }

    const endTimer = PerformanceMonitor.startTimer("fileUpload", {
      fileId,
      filename: uploadState.filename,
      fileSize: uploadState.fileSize,
      fileType: uploadState.fileType,
    });

    try {
      // Update status to processing
      uploadState.status = "processing";
      uploadState.progress = 15;
      this.uploadStates.set(fileId, uploadState);
      this.notifyUploadStateChange(fileId, uploadState);

      // Create document in database
      const document = documentsDB.createDocument(filePath, courseId, chatId);
      logger.info(`Created document ${document.id} for file ${fileId}`);
      
      // Store the document ID in upload state
      uploadState.documentId = document.id;
      this.uploadStates.set(fileId, uploadState);
      this.notifyUploadStateChange(fileId, uploadState);

      // Parse document
      uploadState.progress = 25;
      this.uploadStates.set(fileId, uploadState);
      this.notifyUploadStateChange(fileId, uploadState);

      // Send document to Python backend for complete processing
      uploadState.progress = 40;
      this.uploadStates.set(fileId, uploadState);
      this.notifyUploadStateChange(fileId, uploadState);

      await PerformanceMonitor.measureAsync(
        "fileUpload:ingestToBackend",
        async () => {
          // Backend handles parsing, chunking, embedding, and storage
          // Timeout: 65 minutes (slightly longer than backend's 60 min timeout)
          // Very generous timeout to handle large scanned PDFs with OCR
          const response = await axios.post("http://localhost:8000/ingest", {
            file_path: document.path,
            doc_id: document.id,
            metadata: {
              documentTitle: document.title,
              courseId: document.courseId,
              chatId: document.chatId,
              docType: document.docType,
            }
          }, {
            timeout: 3900000, // 65 minutes in milliseconds
            validateStatus: (status) => status < 500, // Don't throw on 4xx errors
          });
          
          // Check for error responses
          if (response.status >= 400) {
            // Special handling for 504 Gateway Timeout
            if (response.status === 504) {
              logger.warn(`Got 504 timeout for ${document.id}, but document may have processed successfully. Checking...`);
              
              // Wait longer for backend to finish (up to 2 minutes)
              // Try verification multiple times with increasing delays
              const maxRetries = 6;
              const delays = [5000, 10000, 15000, 20000, 30000, 40000]; // Total: 2 minutes
              
              for (let i = 0; i < maxRetries; i++) {
                await new Promise(resolve => setTimeout(resolve, delays[i]));
                
                logger.info(`Verification attempt ${i + 1}/${maxRetries} for document ${document.id}`);
                
                // Try to verify if document was actually ingested by checking ChromaDB
                try {
                  const verifyResponse = await axios.get(`http://localhost:8000/documents/${document.id}/verify`, {
                    timeout: 10000
                  });
                  
                  if (verifyResponse.data.exists && verifyResponse.data.chunks_count > 0) {
                    logger.info(`Document ${document.id} was successfully ingested despite 504 error. Chunks: ${verifyResponse.data.chunks_count}`);
                    // Continue as if successful
                    uploadState.progress = 95;
                    this.uploadStates.set(fileId, uploadState);
                    this.notifyUploadStateChange(fileId, uploadState);
                    
                    // Mark as complete
                    uploadState.status = "complete";
                    uploadState.progress = 100;
                    uploadState.completedAt = new Date();
                    this.uploadStates.set(fileId, uploadState);
                    this.notifyUploadStateChange(fileId, uploadState);
                    
                    logger.info(`File upload complete for ${fileId} (recovered from 504 after ${i + 1} attempts)`);
                    endTimer();
                    return; // Exit successfully
                  } else {
                    logger.info(`Document ${document.id} not yet in database, will retry...`);
                  }
                } catch (verifyError) {
                  logger.warn(`Verification attempt ${i + 1} failed: ${verifyError}`);
                }
              }
              
              logger.error(`Document ${document.id} could not be verified after ${maxRetries} attempts`);
            }
            
            const errorDetail = response.data?.detail || response.data?.error || "Unknown error";
            throw new Error(`Backend error (${response.status}): ${errorDetail}`);
          }
          
          logger.info(`Document ${document.id} ingested to ChromaDB. Chunks created: ${response.data.chunks_created}`);
          
          // Update progress incrementally
          uploadState.progress = 95;
          this.uploadStates.set(fileId, uploadState);
          this.notifyUploadStateChange(fileId, uploadState);
        },
        { documentId: document.id }
      );

      // Mark as complete
      uploadState.status = "complete";
      uploadState.progress = 100;
      uploadState.completedAt = new Date();
      this.uploadStates.set(fileId, uploadState);
      this.notifyUploadStateChange(fileId, uploadState);

      logger.info(`File upload complete for ${fileId}`);
      endTimer();
    } catch (error) {
      endTimer();
      logger.error(`Error processing file ${fileId}:`, error);
      throw error;
    }
  }



  /**
   * Generates thumbnail for image files
   * @param filePath - Path to image file
   * @param fileId - File upload ID
   * @returns Path to thumbnail
   */
  private async generateThumbnail(
    filePath: string,
    fileId: string
  ): Promise<string> {
    try {
      // Create thumbnails directory if it doesn't exist
      const thumbnailsDir = path.join(
        app.getPath("userData"),
        "thumbnails"
      );
      if (!fs.existsSync(thumbnailsDir)) {
        fs.mkdirSync(thumbnailsDir, { recursive: true });
      }

      const ext = path.extname(filePath);
      const thumbnailPath = path.join(thumbnailsDir, `${fileId}${ext}`);

      // For now, just copy the image as thumbnail
      // In a production app, you'd use a library like sharp to resize
      fs.copyFileSync(filePath, thumbnailPath);

      logger.info(`Generated thumbnail for ${fileId} at ${thumbnailPath}`);
      return thumbnailPath;
    } catch (error) {
      logger.error(`Error generating thumbnail for ${fileId}:`, error);
      // Return empty string if thumbnail generation fails
      return "";
    }
  }

  /**
   * Handles upload errors with user-friendly messages
   * @param fileId - File upload ID
   * @param errorMessage - Error message
   */
  private handleUploadError(fileId: string, errorMessage: string): void {
    const uploadState = this.uploadStates.get(fileId);
    if (uploadState) {
      uploadState.status = "error";
      // Store the original error for debugging, but it will be converted to user-friendly in UI
      uploadState.error = this.getUserFriendlyError(errorMessage);
      this.uploadStates.set(fileId, uploadState);
      this.notifyUploadStateChange(fileId, uploadState);
      
      // Log detailed error for debugging
      logger.error(`Upload error for ${fileId}:`, errorMessage);
    }
  }

  /**
   * Converts technical error messages to user-friendly ones
   * @param error - Technical error message
   * @returns User-friendly error message
   */
  private getUserFriendlyError(error: string): string {
    if (error.includes("ENOENT") || error.includes("not found")) {
      return "File not found. The file may have been moved or deleted.";
    }
    if (error.includes("EACCES") || error.includes("permission")) {
      return "Permission denied. Please check file permissions.";
    }
    if (error.includes("timeout") || error.includes("timed out") || error.includes("504")) {
      return "Processing timed out. The file may be too large or complex. Try splitting it into smaller parts.";
    }
    if (error.includes("ECONNREFUSED") || error.includes("ECONNRESET")) {
      return "Backend server is not running. Please start the Python backend server.";
    }
    if (error.includes("network")) {
      return "Network error. Please check your connection.";
    }
    if (error.includes("unsupported") || error.includes("format")) {
      return "Unsupported file format.";
    }
    if (error.includes("too large") || error.includes("size") || error.includes("50MB") || error.includes("500 pages")) {
      return "File is too large for OCR processing. Maximum: 50MB or 500 pages. Try splitting the PDF.";
    }
    if (error.includes("parse") || error.includes("parsing")) {
      return "Failed to parse document. The file may be corrupted.";
    }
    if (error.includes("embed") || error.includes("embedding")) {
      return "Failed to process document. Please try again.";
    }
    if (error.includes("status code 500") || error.includes("Internal Server Error")) {
      return "Server error while processing document. The file may be too large or complex. Check backend logs for details.";
    }
    if (error.includes("OCR") || error.includes("scanned")) {
      return "OCR processing failed. The scanned document may be too large or low quality.";
    }
    
    // Return original error if it's short and readable
    if (error.length < 100 && !error.includes("Error:") && !error.includes("at ")) {
      return error;
    }
    
    // Generic fallback
    return "Upload failed. Please try again or check if the file is too large.";
  }

  /**
   * Retries a failed upload
   * @param fileId - File upload ID
   * @param filePath - Path to file
   * @returns Updated upload state
   */
  public async retryUpload(fileId: string, filePath: string): Promise<FileUploadState> {
    const uploadState = this.uploadStates.get(fileId);
    if (!uploadState) {
      throw new Error(`Upload state not found for ${fileId}`);
    }

    if (uploadState.status !== "error") {
      throw new Error(`Cannot retry upload that is not in error state`);
    }

    logger.info(`Retrying upload for ${fileId}`);

    // Reset state
    uploadState.status = "pending";
    uploadState.progress = 0;
    uploadState.error = undefined;
    uploadState.startedAt = new Date();
    uploadState.completedAt = undefined;
    this.uploadStates.set(fileId, uploadState);
    this.notifyUploadStateChange(fileId, uploadState);

    // Restart processing
    try {
      await this.processFileBackground(
        fileId,
        filePath,
        uploadState.courseId,
        uploadState.chatId
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Retry failed for ${fileId}:`, error);
      this.handleUploadError(fileId, errorMessage);
    }

    const state = this.uploadStates.get(fileId);
    if (!state) {
      throw new Error(`Upload state not found for ${fileId}`);
    }
    return state;
  }

  /**
   * Cancels an ongoing upload
   * @param fileId - File upload ID
   */
  public cancelUpload(fileId: string): void {
    const uploadState = this.uploadStates.get(fileId);
    if (uploadState) {
      logger.info(`Cancelling upload for ${fileId}`);
      this.uploadStates.delete(fileId);
      this.notifyUploadCancelled(fileId);

      // Clean up thumbnail if it exists
      if (uploadState.thumbnailPath && fs.existsSync(uploadState.thumbnailPath)) {
        try {
          fs.unlinkSync(uploadState.thumbnailPath);
        } catch (error) {
          logger.error(`Error deleting thumbnail for ${fileId}:`, error);
        }
      }
    }
  }

  /**
   * Gets upload state for a file
   * @param fileId - File upload ID
   * @returns Upload state or undefined
   */
  public getUploadState(fileId: string): FileUploadState | undefined {
    return this.uploadStates.get(fileId);
  }

  /**
   * Gets all upload states for a chat
   * @param chatId - Chat ID
   * @returns Array of upload states
   */
  public getUploadStatesByChat(chatId: string): FileUploadState[] {
    return Array.from(this.uploadStates.values()).filter(
      (state) => state.chatId === chatId
    );
  }

  /**
   * Determines file type from extension
   * @param filePath - Path to file
   * @returns File type
   */
  private getFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return ext.slice(1); // Remove the dot
  }

  /**
   * Gets file size in bytes
   * @param filePath - Path to file
   * @returns File size
   */
  private getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      logger.error(`Error getting file size for ${filePath}:`, error);
      return 0;
    }
  }

  /**
   * Checks if file is an image
   * @param fileType - File type
   * @returns True if image
   */
  private isImageFile(fileType: string): boolean {
    const imageTypes = ["png", "jpg", "jpeg", "gif"];
    return imageTypes.includes(fileType.toLowerCase());
  }

  /**
   * Notifies renderer process of upload state change
   * @param fileId - File upload ID
   * @param uploadState - Upload state
   */
  private notifyUploadStateChange(
    fileId: string,
    uploadState: FileUploadState
  ): void {
    const windows = webContents.getAllWebContents();
    windows.forEach((webContent) => {
      webContent.send(`file:upload:state:${fileId}`, uploadState);
    });
  }

  /**
   * Notifies renderer process of upload cancellation
   * @param fileId - File upload ID
   */
  private notifyUploadCancelled(fileId: string): void {
    const windows = webContents.getAllWebContents();
    windows.forEach((webContent) => {
      webContent.send(`file:upload:cancelled:${fileId}`);
    });
  }
}

export default FileUploadManager;
