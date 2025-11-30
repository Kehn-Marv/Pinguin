import logger from "electron-log";
import { app } from "electron";
import path from "path";
import fs from "fs";
import ProcessManager from "../ProcessManager";

const log = logger.log;

export type OllamaStatus = 
  | "checking"
  | "ready"
  | "starting-system"
  | "starting-bundled"
  | "needs-install"
  | "error";

export interface OllamaInitResult {
  status: OllamaStatus;
  source?: "existing" | "system" | "bundled";
  host?: string;
  error?: string;
}

/**
 * OllamaManager handles Ollama initialization with fallback strategy:
 * 1. Check if Ollama is already running
 * 2. Try to start system-installed Ollama
 * 3. Try to start bundled Ollama
 * 4. Show manual install prompt if all fail
 */
class OllamaManager {
  private static instance: OllamaManager;
  private processManager: ProcessManager;
  private currentStatus: OllamaStatus = "checking";

  private constructor() {
    this.processManager = ProcessManager.getInstance();
  }

  public static getInstance(): OllamaManager {
    if (!OllamaManager.instance) {
      OllamaManager.instance = new OllamaManager();
    }
    return OllamaManager.instance;
  }

  /**
   * Initialize Ollama with fallback strategy
   */
  public async initialize(): Promise<OllamaInitResult> {
    log("Initializing Ollama...");
    this.currentStatus = "checking";

    // Step 1: Check if already running
    try {
      const isRunning = await this.checkIfRunning();
      if (isRunning) {
        log("Ollama is already running");
        this.currentStatus = "ready";
        return {
          status: "ready",
          source: "existing",
          host: this.processManager.getOllamaHost(),
        };
      }
    } catch (error: any) {
      log(`Error checking if Ollama is running: ${error.message}`);
    }

    // Step 2: Try to start system Ollama
    try {
      log("Attempting to start system Ollama...");
      this.currentStatus = "starting-system";
      await this.startSystemOllama();
      
      // Verify it started
      if (await this.checkIfRunning()) {
        log("System Ollama started successfully");
        this.currentStatus = "ready";
        return {
          status: "ready",
          source: "system",
          host: this.processManager.getOllamaHost(),
        };
      }
    } catch (error: any) {
      log(`Failed to start system Ollama: ${error.message}`);
    }

    // Step 3: Try to start bundled Ollama
    try {
      log("Attempting to start bundled Ollama...");
      this.currentStatus = "starting-bundled";
      
      // Check if bundled Ollama exists
      if (!this.hasBundledOllama()) {
        log("No bundled Ollama found");
        throw new Error("Bundled Ollama not found");
      }

      await this.startBundledOllama();
      
      // Verify it started
      if (await this.checkIfRunning()) {
        log("Bundled Ollama started successfully");
        this.currentStatus = "ready";
        return {
          status: "ready",
          source: "bundled",
          host: this.processManager.getOllamaHost(),
        };
      }
    } catch (error: any) {
      log(`Failed to start bundled Ollama: ${error.message}`);
    }

    // Step 4: All methods failed
    log("All Ollama initialization methods failed");
    this.currentStatus = "needs-install";
    return {
      status: "needs-install",
      error: "Could not start Ollama. Please install Ollama manually.",
    };
  }

  /**
   * Check if Ollama is running by pinging the API
   */
  private async checkIfRunning(): Promise<boolean> {
    try {
      // Try default port first
      const defaultHost = "http://localhost:11434";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(defaultHost, {
        method: "GET",
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // Update ProcessManager if it's not aware
        if (!this.processManager.isOllamaRunning()) {
          log("Found running Ollama instance, updating ProcessManager");
          // ProcessManager will detect it on next health check
        }
        return true;
      }
    } catch (error) {
      // Not running on default port
    }

    // Check if ProcessManager thinks it's running
    return this.processManager.isOllamaRunning();
  }

  /**
   * Try to start system-installed Ollama
   */
  private async startSystemOllama(): Promise<void> {
    // Use ProcessManager which will try to spawn "ollama serve"
    await this.processManager.startOllama();
  }

  /**
   * Try to start bundled Ollama
   */
  private async startBundledOllama(): Promise<void> {
    // ProcessManager already handles bundled Ollama
    await this.processManager.startOllama();
  }

  /**
   * Check if bundled Ollama binary exists
   */
  private hasBundledOllama(): boolean {
    try {
      const binaryPath = this.getBundledOllamaPath();
      return fs.existsSync(binaryPath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get path to bundled Ollama binary
   */
  private getBundledOllamaPath(): string {
    let folderPath = "";
    if (app.isPackaged) {
      folderPath = path.join(process.resourcesPath, "ollama");
    } else {
      folderPath = path.join(__dirname, "../../../extraResources", "ollama");
    }

    let fileName = "";
    if (process.platform === "linux") {
      fileName = "ollama-linux-amd64";
    } else if (process.platform === "win32") {
      fileName = "ollama.exe";
    } else {
      throw new Error("Unsupported platform");
    }

    return path.join(folderPath, fileName);
  }

  /**
   * Get current status
   */
  public getStatus(): OllamaStatus {
    return this.currentStatus;
  }

  /**
   * Get Ollama host URL
   */
  public getHost(): string | null {
    if (this.currentStatus === "ready") {
      return this.processManager.getOllamaHost();
    }
    return null;
  }

  /**
   * Stop Ollama
   */
  public stop(): void {
    this.processManager.stopOllama();
    this.currentStatus = "checking";
  }
}

export default OllamaManager;
