import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { app, safeStorage } from "electron";
import logger from "electron-log";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_FILE = "encryption.key";

/**
 * DocumentStorage provides encrypted storage for documents
 * Uses AES-256-GCM for encryption and Electron's safeStorage for key management
 */
class DocumentStorage {
  private static instance: DocumentStorage | null = null;
  private encryptionKey: Buffer | null = null;
  private storageDir: string;
  private keyFilePath: string;

  private constructor() {
    this.storageDir = path.join(app.getPath("userData"), "documents", "storage");
    this.keyFilePath = path.join(app.getPath("userData"), "documents", KEY_FILE);
    this.ensureStorageDirectory();
  }

  /**
   * Get singleton instance of DocumentStorage
   */
  public static getInstance(): DocumentStorage {
    if (!DocumentStorage.instance) {
      DocumentStorage.instance = new DocumentStorage();
    }
    return DocumentStorage.instance;
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
      logger.info(`Created document storage directory: ${this.storageDir}`);
    }
  }

  /**
   * Get or generate encryption key using Electron's safeStorage
   */
  private getEncryptionKey(): Buffer {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    try {
      // Check if safeStorage is available
      if (!safeStorage.isEncryptionAvailable()) {
        logger.warn("System encryption not available, using fallback");
        // Fallback to a derived key (less secure but functional)
        this.encryptionKey = crypto.scryptSync("pinguin-fallback-key", "salt", 32);
        return this.encryptionKey;
      }

      // Try to load existing key
      if (fs.existsSync(this.keyFilePath)) {
        logger.info("Loading encryption key from storage");
        const encryptedKey = fs.readFileSync(this.keyFilePath);
        const decryptedKey = safeStorage.decryptString(encryptedKey);
        this.encryptionKey = Buffer.from(decryptedKey, "hex");
        return this.encryptionKey;
      }

      // Generate new key if none exists
      logger.info("Generating new encryption key");
      const newKey = crypto.randomBytes(32); // 256 bits for AES-256
      
      // Encrypt and store key using system encryption
      const encryptedKey = safeStorage.encryptString(newKey.toString("hex"));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fs.writeFileSync(this.keyFilePath, encryptedKey as any);
      logger.info("Stored encryption key securely");
      
      this.encryptionKey = newKey;
      return this.encryptionKey;
    } catch (error) {
      logger.error("Failed to get/generate encryption key:", error);
      throw new Error("Failed to initialize encryption key");
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: Buffer): Buffer {
    const key = this.getEncryptionKey();
    
    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cipher = crypto.createCipheriv(ALGORITHM, key as any, iv as any);
    
    // Encrypt data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const encrypted = Buffer.concat([cipher.update(data as any), cipher.final() as any]);
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV + authTag + encrypted data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Buffer.concat([iv as any, authTag as any, encrypted as any]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(encryptedData: Buffer): Buffer {
    const key = this.getEncryptionKey();
    
    // Extract IV, auth tag, and encrypted data
    const iv = encryptedData.subarray(0, IV_LENGTH);
    const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    // Create decipher
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decipher = crypto.createDecipheriv(ALGORITHM, key as any, iv as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    decipher.setAuthTag(authTag as any);
    
    // Decrypt data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Buffer.concat([decipher.update(encrypted as any), decipher.final() as any]);
  }

  /**
   * Save document with encryption
   * @param docId Document ID
   * @param filePath Path to source file
   * @returns Path where encrypted document is stored
   */
  public saveDocument(docId: string, filePath: string): string {
    try {
      logger.info(`Saving document ${docId} from ${filePath}`);
      
      // Read source file
      const fileData = fs.readFileSync(filePath);
      
      // Encrypt data
      const encryptedData = this.encrypt(fileData);
      
      // Determine file extension
      const extension = path.extname(filePath);
      const encryptedFileName = `${docId}${extension}.enc`;
      const destinationPath = path.join(this.storageDir, encryptedFileName);
      
      // Write encrypted file
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fs.writeFileSync(destinationPath, encryptedData as any);
      
      logger.info(`Document ${docId} saved and encrypted at ${destinationPath}`);
      return destinationPath;
    } catch (error: any) {
      logger.error(`Failed to save document ${docId}:`, error);
      throw new Error(`Failed to save document: ${error?.message || "Unknown error"}`);
    }
  }

  /**
   * Load and decrypt document
   * @param docId Document ID
   * @param storedPath Path to encrypted file
   * @param outputPath Path where decrypted file should be written (temporary)
   * @returns Path to decrypted file
   */
  public loadDocument(docId: string, storedPath: string, outputPath: string): string {
    try {
      logger.info(`Loading document ${docId} from ${storedPath}`);
      
      // Read encrypted file
      const encryptedData = fs.readFileSync(storedPath);
      
      // Decrypt data
      const decryptedData = this.decrypt(encryptedData);
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Write decrypted file
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fs.writeFileSync(outputPath, decryptedData as any);
      
      logger.info(`Document ${docId} decrypted to ${outputPath}`);
      return outputPath;
    } catch (error: any) {
      logger.error(`Failed to load document ${docId}:`, error);
      throw new Error(`Failed to load document: ${error?.message || "Unknown error"}`);
    }
  }

  /**
   * Delete encrypted document file
   * @param storedPath Path to encrypted file
   */
  public deleteDocument(storedPath: string): void {
    try {
      if (fs.existsSync(storedPath)) {
        fs.unlinkSync(storedPath);
        logger.info(`Deleted encrypted document at ${storedPath}`);
      } else {
        logger.warn(`Document not found at ${storedPath}`);
      }
    } catch (error: unknown) {
      logger.error(`Failed to delete document at ${storedPath}:`, error);
      throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Get storage directory path
   */
  public getStorageDir(): string {
    return this.storageDir;
  }

  /**
   * Calculate storage size in bytes
   */
  public getStorageSize(): number {
    try {
      let totalSize = 0;
      const files = fs.readdirSync(this.storageDir);
      
      for (const file of files) {
        const filePath = path.join(this.storageDir, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      logger.error("Failed to calculate storage size:", error);
      return 0;
    }
  }

  /**
   * Clear encryption key from memory (for security)
   */
  public clearKey(): void {
    if (this.encryptionKey) {
      this.encryptionKey.fill(0);
      this.encryptionKey = null;
      logger.info("Cleared encryption key from memory");
    }
  }
}

export default DocumentStorage;
