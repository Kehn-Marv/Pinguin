import logger from "electron-log";
import DocumentMetadataManager, { DocumentMetadata } from "./DocumentMetadata";

/**
 * Result of duplicate detection
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingDocument?: DocumentMetadata;
  message: string;
}

/**
 * DuplicateDetection handles detection of duplicate documents
 * Uses SHA-256 content hashing for accurate duplicate detection
 */
class DuplicateDetection {
  private static instance: DuplicateDetection | null = null;
  private metadataManager: DocumentMetadataManager;

  private constructor() {
    this.metadataManager = DocumentMetadataManager.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DuplicateDetection {
    if (!DuplicateDetection.instance) {
      DuplicateDetection.instance = new DuplicateDetection();
    }
    return DuplicateDetection.instance;
  }

  /**
   * Check if a document is a duplicate based on content hash
   * @param filePath Path to the file to check
   * @returns Duplicate check result
   */
  public checkDuplicate(filePath: string): DuplicateCheckResult {
    try {
      logger.info(`Checking for duplicate: ${filePath}`);

      // Calculate content hash
      const contentHash = this.metadataManager.calculateContentHash(filePath);
      logger.info(`Content hash: ${contentHash}`);

      // Check if document with same hash exists
      const existingDocument = this.metadataManager.findByContentHash(contentHash);

      if (existingDocument) {
        logger.info(
          `Duplicate found: ${existingDocument.filename} (ID: ${existingDocument.id})`
        );
        return {
          isDuplicate: true,
          existingDocument,
          message: `This document already exists as "${existingDocument.filename}"`,
        };
      }

      logger.info("No duplicate found");
      return {
        isDuplicate: false,
        message: "Document is unique",
      };
    } catch (error) {
      logger.error("Failed to check for duplicates:", error);
      // Return non-duplicate on error to allow upload
      return {
        isDuplicate: false,
        message: "Could not verify duplicate status",
      };
    }
  }

  /**
   * Check multiple files for duplicates
   * @param filePaths Array of file paths to check
   * @returns Map of file paths to duplicate check results
   */
  public checkMultipleDuplicates(
    filePaths: string[]
  ): Map<string, DuplicateCheckResult> {
    logger.info(`Checking ${filePaths.length} files for duplicates`);
    const results = new Map<string, DuplicateCheckResult>();

    for (const filePath of filePaths) {
      const result = this.checkDuplicate(filePath);
      results.set(filePath, result);
    }

    const duplicateCount = Array.from(results.values()).filter(
      (r) => r.isDuplicate
    ).length;
    logger.info(`Found ${duplicateCount} duplicates out of ${filePaths.length} files`);

    return results;
  }

  /**
   * Check if document with same hash exists in a specific course
   * @param filePath Path to the file to check
   * @param courseId Course ID to check within
   * @returns Duplicate check result
   */
  public checkDuplicateInCourse(
    filePath: string,
    courseId: string
  ): DuplicateCheckResult {
    try {
      logger.info(`Checking for duplicate in course ${courseId}: ${filePath}`);

      // Calculate content hash
      const contentHash = this.metadataManager.calculateContentHash(filePath);

      // Get all documents in the course
      const courseDocuments = this.metadataManager.getMetadataByCourse(courseId);

      // Check if any document in the course has the same hash
      const existingDocument = courseDocuments.find(
        (doc) => doc.contentHash === contentHash
      );

      if (existingDocument) {
        logger.info(
          `Duplicate found in course: ${existingDocument.filename} (ID: ${existingDocument.id})`
        );
        return {
          isDuplicate: true,
          existingDocument,
          message: `This document already exists in this course as "${existingDocument.filename}"`,
        };
      }

      logger.info("No duplicate found in course");
      return {
        isDuplicate: false,
        message: "Document is unique in this course",
      };
    } catch (error) {
      logger.error("Failed to check for duplicates in course:", error);
      return {
        isDuplicate: false,
        message: "Could not verify duplicate status",
      };
    }
  }

  /**
   * Find all duplicate documents across the entire system
   * @returns Array of duplicate groups (documents with same content hash)
   */
  public findAllDuplicates(): DocumentMetadata[][] {
    logger.info("Finding all duplicate documents");

    const allDocuments = this.metadataManager.getAllMetadata();
    const hashGroups = new Map<string, DocumentMetadata[]>();

    // Group documents by content hash
    for (const doc of allDocuments) {
      const existing = hashGroups.get(doc.contentHash) || [];
      existing.push(doc);
      hashGroups.set(doc.contentHash, existing);
    }

    // Filter to only groups with duplicates (more than 1 document)
    const duplicateGroups = Array.from(hashGroups.values()).filter(
      (group) => group.length > 1
    );

    logger.info(`Found ${duplicateGroups.length} duplicate groups`);
    return duplicateGroups;
  }

  /**
   * Get duplicate statistics
   */
  public getDuplicateStats(): {
    totalDocuments: number;
    uniqueDocuments: number;
    duplicateGroups: number;
    totalDuplicates: number;
    wastedSpace: number; // bytes
  } {
    const allDocuments = this.metadataManager.getAllMetadata();
    const hashGroups = new Map<string, DocumentMetadata[]>();

    // Group documents by content hash
    for (const doc of allDocuments) {
      const existing = hashGroups.get(doc.contentHash) || [];
      existing.push(doc);
      hashGroups.set(doc.contentHash, existing);
    }

    const duplicateGroups = Array.from(hashGroups.values()).filter(
      (group) => group.length > 1
    );

    // Calculate wasted space (size of duplicate copies)
    let wastedSpace = 0;
    for (const group of duplicateGroups) {
      // Keep one copy, count others as wasted
      const duplicateCount = group.length - 1;
      const fileSize = group[0].fileSize;
      wastedSpace += duplicateCount * fileSize;
    }

    const totalDuplicates = duplicateGroups.reduce(
      (sum, group) => sum + (group.length - 1),
      0
    );

    return {
      totalDocuments: allDocuments.length,
      uniqueDocuments: hashGroups.size,
      duplicateGroups: duplicateGroups.length,
      totalDuplicates,
      wastedSpace,
    };
  }

  /**
   * Prevent duplicate upload by checking before processing
   * @param filePath Path to file being uploaded
   * @param courseId Optional course ID for course-specific check
   * @returns True if upload should be prevented, false otherwise
   */
  public shouldPreventUpload(
    filePath: string,
    courseId?: string
  ): { prevent: boolean; reason?: string; existingDoc?: DocumentMetadata } {
    const result = courseId
      ? this.checkDuplicateInCourse(filePath, courseId)
      : this.checkDuplicate(filePath);

    if (result.isDuplicate) {
      return {
        prevent: true,
        reason: result.message,
        existingDoc: result.existingDocument,
      };
    }

    return { prevent: false };
  }
}

export default DuplicateDetection;
