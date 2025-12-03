import { BrowserWindow, ipcMain } from "electron";
import logger from "electron-log";
import ProcessManager from "../ProcessManager";
import ConfigStore from "../ConfigStore";
import OllamaManager from "../ollama/OllamaManager";
import path from "path";

const log = logger.log;

// Webpack constants injected by Electron Forge
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export type StartupStatus =
  | "initializing"
  | "loading-config"
  | "starting-ollama"
  | "starting-backend"
  | "creating-window"
  | "ready"
  | "error";

export interface StartupProgress {
  status: StartupStatus;
  message: string;
  progress: number; // 0-100
  error?: string;
}

/**
 * StartupManager orchestrates the application startup sequence
 * Handles configuration loading, service initialization, and window creation
 */
class StartupManager {
  private static instance: StartupManager;
  private configStore: ConfigStore;
  private processManager: ProcessManager;
  private ollamaManager: OllamaManager;
  private mainWindow: BrowserWindow | null = null;
  private splashWindow: BrowserWindow | null = null;
  private currentStatus: StartupStatus = "initializing";
  private readonly STARTUP_TIMEOUT = 60000; // 60 seconds per service

  private constructor() {
    this.configStore = ConfigStore.getInstance();
    this.processManager = ProcessManager.getInstance();
    this.ollamaManager = OllamaManager.getInstance();
    this.registerIPCHandlers();
  }

  /**
   * Register IPC handlers for startup status
   */
  private registerIPCHandlers(): void {
    ipcMain.handle("startup:getStatus", () => {
      return this.currentStatus;
    });

    ipcMain.handle("startup:isReady", () => {
      return this.isReady();
    });
  }

  public static getInstance(): StartupManager {
    if (!StartupManager.instance) {
      StartupManager.instance = new StartupManager();
    }
    return StartupManager.instance;
  }

  /**
   * Execute the complete startup sequence
   */
  public async startup(): Promise<void> {
    try {
      log("=== Starting Pinguin Application ===");

      // Step 1: Load configuration
      await this.loadConfiguration();

      // Step 2: Start Ollama service
      await this.startOllamaService();

      // Step 3: Start Python backend
      await this.startPythonBackendService();

      // Step 4: Create and show main window
      await this.createMainWindow();

      // Step 5: Mark as ready
      this.updateStatus("ready", "Application ready", 100);
      log("=== Pinguin Application Started Successfully ===");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Startup failed: ${errorMessage}`);
      this.updateStatus("error", `Startup failed: ${errorMessage}`, 0, errorMessage);
      throw error;
    }
  }

  /**
   * Step 1: Load configuration from electron-store
   */
  private async loadConfiguration(): Promise<void> {
    this.updateStatus("loading-config", "Loading configuration...", 10);
    log("Loading configuration from electron-store");

    try {
      // Configuration is automatically loaded by ConfigStore singleton
      const config = this.configStore.getAll();
      log(`Configuration loaded: ${JSON.stringify(config, null, 2)}`);

      // Validate critical configuration
      if (!config.activeEmbeddingModel) {
        log("Warning: No embedding model configured");
      }

      if (!config.activeLLM) {
        log("Warning: No LLM configured");
      }

      this.updateStatus("loading-config", "Configuration loaded", 20);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Failed to load configuration: ${errorMessage}`);
      throw new Error(`Configuration loading failed: ${errorMessage}`);
    }
  }

  /**
   * Step 2: Start Ollama with fallback strategy
   */
  private async startOllamaService(): Promise<void> {
    this.updateStatus("starting-ollama", "Initializing Ollama...", 30);
    log("Initializing Ollama with fallback strategy");

    try {
      // Use OllamaManager for smart initialization
      const result = await this.withTimeout(
        this.ollamaManager.initialize(),
        this.STARTUP_TIMEOUT,
        "Ollama initialization timeout"
      );

      if (result.status === "ready") {
        const sourceLabel = result.source === "existing" 
          ? "existing instance" 
          : result.source === "system" 
          ? "system installation" 
          : "bundled version";
        
        log(`Ollama ready from ${sourceLabel} at ${result.host}`);
        this.updateStatus("starting-ollama", `Ollama ready (${sourceLabel})`, 50);
      } else if (result.status === "needs-install") {
        log("Ollama not found - user needs to install manually");
        // Don't throw error - let the app start and show the RequiresOllama screen
        this.updateStatus("starting-ollama", "Ollama not found (manual install needed)", 50);
      } else {
        throw new Error(result.error || "Failed to initialize Ollama");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Failed to initialize Ollama: ${errorMessage}`);
      // Don't throw - let app start and show error in UI
      this.updateStatus("starting-ollama", "Ollama initialization failed", 50);
    }
  }

  /**
   * Step 3: Start Python backend with health check
   */
  private async startPythonBackendService(): Promise<void> {
    this.updateStatus("starting-backend", "Starting Python backend...", 60);
    log("Starting Python backend service");

    try {
      // Get embedding model from ModelsManager (source of truth)
      let embeddingModel = "";
      try {
        const ModelsManager = (await import("../model/ModelsManager")).default;
        const modelsManager = await ModelsManager.getInstance();
        embeddingModel = modelsManager.getSelectedEmbedding() || "";
      } catch (error: unknown) {
        log(`Could not get embedding model from ModelsManager: ${error instanceof Error ? error.message : String(error)}`);
        // Fallback to ConfigStore
        embeddingModel = this.configStore.get("activeEmbeddingModel");
      }
      
      log(`Passing embedding model to backend: ${embeddingModel || "(none)"}`);

      // Start Python backend with timeout
      await this.withTimeout(
        this.processManager.startPythonBackend(embeddingModel),
        this.STARTUP_TIMEOUT,
        "Python backend startup timeout"
      );

      // Verify Python backend is running
      if (!this.processManager.isPythonBackendRunning()) {
        throw new Error("Python backend failed to start");
      }

      const backendHost = this.processManager.getPythonBackendHost();
      log(`Python backend started successfully at ${backendHost}`);
      this.updateStatus("starting-backend", `Backend ready at ${backendHost}`, 80);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Failed to start Python backend: ${errorMessage}`);
      throw new Error(`Python backend startup failed: ${errorMessage}`);
    }
  }

  /**
   * Step 4: Create and show main window
   */
  private async createMainWindow(): Promise<void> {
    this.updateStatus("creating-window", "Creating main window...", 90);
    log("Creating main window");

    try {
      // Webpack entry points are available as constants from Electron Forge
      // Create the browser window
      this.mainWindow = new BrowserWindow({
        height: 800,
        width: 1200,
        minHeight: 600,
        minWidth: 800,
        show: false, // Don't show until ready
        webPreferences: {
          preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
          nodeIntegration: false,
          contextIsolation: true,
        },
        icon: path.join(__dirname, "../../../public/icon.png"),
      });

      // Remove menu bar
      this.mainWindow.removeMenu();

      // Load the app
      await this.mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

      // Don't auto-show - let the startup sequence control visibility
      // This allows first-run wizard to show before main window
      this.mainWindow.once("ready-to-show", () => {
        log("Main window ready to show (waiting for startup sequence)");
      });

      // Handle window close
      this.mainWindow.on("closed", () => {
        this.mainWindow = null;
      });

      log("Main window created successfully");
      this.updateStatus("creating-window", "Main window created", 95);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Failed to create main window: ${errorMessage}`);
      throw new Error(`Window creation failed: ${errorMessage}`);
    }
  }

  /**
   * Update startup status and notify splash window
   */
  private updateStatus(
    status: StartupStatus,
    message: string,
    progress: number,
    error?: string
  ): void {
    this.currentStatus = status;
    log(`Startup status: ${status} - ${message} (${progress}%)`);

    const statusUpdate: StartupProgress = {
      status,
      message,
      progress,
      error,
    };

    // Send to splash window if it exists
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.webContents.send("startup:progress", statusUpdate);
    }

    // Send to main window if it exists
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("startup:progress", statusUpdate);
    }
  }

  /**
   * Set splash window reference
   */
  public setSplashWindow(window: BrowserWindow): void {
    this.splashWindow = window;
  }

  /**
   * Get main window
   */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Get current startup status
   */
  public getCurrentStatus(): StartupStatus {
    return this.currentStatus;
  }

  /**
   * Check if startup is complete
   */
  public isReady(): boolean {
    return this.currentStatus === "ready";
  }

  /**
   * Wrap a promise with a timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      ),
    ]);
  }
}

export default StartupManager;
