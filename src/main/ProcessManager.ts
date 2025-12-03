import { ChildProcess, spawn } from "child_process";
import path from "path";
import { app, BrowserWindow } from "electron";
import fs from "fs";
import logger from "electron-log";
import os from "os";
import { getProcessMonitor } from "./processes/ProcessMonitor";

const log = logger.log;

interface ServiceConfig {
  name: string;
  process: ChildProcess | null;
  port: number;
  host: string;
  status: "stopped" | "starting" | "running" | "crashed";
  restartAttempts: number;
  maxRestartAttempts: number;
}

/**
 * ProcessManager handles lifecycle management for Ollama and Python backend services
 * Includes port conflict detection, health checks, and crash recovery with exponential backoff
 */
class ProcessManager {
  private static instance: ProcessManager;

  private ollama: ServiceConfig;
  private pythonBackend: ServiceConfig;
  private readonly OLLAMA_PORT_RANGE = { start: 11434, end: 11440 };
  private readonly PYTHON_PORT = 8000;
  private readonly HEALTH_CHECK_TIMEOUT = 600000; // 600 seconds (10 minutes - very generous for slow machines)
  private readonly HEALTH_CHECK_INTERVAL = 2000; // 2 seconds (log less frequently)

  private constructor() {
    this.ollama = {
      name: "Ollama",
      process: null,
      port: this.OLLAMA_PORT_RANGE.start,
      host: "",
      status: "stopped",
      restartAttempts: 0,
      maxRestartAttempts: 3,
    };

    this.pythonBackend = {
      name: "Python Backend",
      process: null,
      port: this.PYTHON_PORT,
      host: "",
      status: "stopped",
      restartAttempts: 0,
      maxRestartAttempts: 3,
    };
  }

  public static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  /**
   * Start Ollama service with port conflict detection
   */
  public async startOllama(): Promise<void> {
    if (this.ollama.status === "running") {
      log("Ollama is already running");
      return;
    }

    this.ollama.status = "starting";
    log("Starting Ollama service...");

    // Try to find an available port
    for (
      let port = this.OLLAMA_PORT_RANGE.start;
      port <= this.OLLAMA_PORT_RANGE.end;
      port++
    ) {
      const host = `http://localhost:${port}`;
      
      // Check if port is already in use by a running Ollama instance
      if (await this.checkHealth(host)) {
        log(`Found existing Ollama instance on port ${port}`);
        this.ollama.port = port;
        this.ollama.host = host;
        this.ollama.status = "running";
        return;
      }

      // Try to start Ollama on this port
      try {
        await this.spawnOllama(port);
        this.ollama.port = port;
        this.ollama.host = host;
        
        // Wait for health check
        const isHealthy = await this.waitForHealth(host, this.HEALTH_CHECK_TIMEOUT);
        if (isHealthy) {
          this.ollama.status = "running";
          log(`Ollama started successfully on port ${port}`);
          return;
        } else {
          log(`Ollama failed health check on port ${port}, trying next port`);
          this.killProcess(this.ollama);
        }
      } catch (error: any) {
        log(`Failed to start Ollama on port ${port}: ${error.message}`);
      }
    }

    this.ollama.status = "crashed";
    throw new Error(
      `Failed to start Ollama on any port in range ${this.OLLAMA_PORT_RANGE.start}-${this.OLLAMA_PORT_RANGE.end}`
    );
  }

  /**
   * Spawn Ollama process on specified port
   */
  private async spawnOllama(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const host = `http://localhost:${port}`;
      const modelPath = this.getOllamaModelsPath();
      
      if (!fs.existsSync(modelPath)) {
        fs.mkdirSync(modelPath, { recursive: true });
      }

      const env = {
        ...process.env,
        OLLAMA_HOST: host,
        OLLAMA_MODELS: modelPath,
        HOME: os.homedir(),
      };

      const binaryPath = this.getOllamaBinaryPath();
      
      log(`Spawning Ollama: ${binaryPath} serve`);
      
      const ollamaProcess = spawn(binaryPath, ["serve"], {
        env,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      ollamaProcess.stdout?.on("data", (data) => {
        log(`Ollama stdout: ${data}`);
      });

      ollamaProcess.stderr?.on("data", (data) => {
        log(`Ollama stderr: ${data}`);
      });

      ollamaProcess.on("error", (error) => {
        log(`Ollama process error: ${error.message}`);
        reject(error);
      });

      ollamaProcess.on("exit", (code, signal) => {
        log(`Ollama process exited with code ${code} and signal ${signal}`);
        if (this.ollama.status === "running") {
          this.handleServiceCrash(this.ollama, "ollama");
        }
      });

      this.ollama.process = ollamaProcess;
      
      // Register with process monitor
      const processMonitor = getProcessMonitor();
      processMonitor.registerProcess("ollama", ollamaProcess, {
        name: "ollama",
        maxRestartAttempts: 3,
        initialBackoffMs: 2000,
        maxBackoffMs: 30000,
        onRestart: async () => {
          await this.startOllama();
        },
        onMaxAttemptsExceeded: () => {
          this.notifyUser("Ollama", "Maximum restart attempts exceeded. Please restart manually.");
        },
      });
      
      resolve();
    });
  }

  /**
   * Get path to Ollama binary
   */
  private getOllamaBinaryPath(): string {
    let folderPath = "";
    if (app.isPackaged) {
      folderPath = path.join(process.resourcesPath, "ollama");
    } else {
      folderPath = path.join(__dirname, "../../extraResources", "ollama");
    }

    // Detect platform and architecture
    const arch = process.arch; // 'x64', 'arm64', etc.
    let platformFolder = "";
    let fileName = "";
    
    if (process.platform === "linux") {
      platformFolder = `linux-${arch}`;
      fileName = arch === "arm64" ? "ollama-linux-arm64" : "ollama-linux-amd64";
    } else if (process.platform === "win32") {
      platformFolder = `win32-${arch}`;
      fileName = "ollama.exe";
    } else if (process.platform === "darwin") {
      platformFolder = `darwin-${arch}`;
      fileName = "ollama";
    } else {
      throw new Error("Unsupported operating system for Ollama");
    }

    const ollamaPath = path.join(folderPath, platformFolder, fileName);
    log(`Resolved Ollama binary path (${process.platform}-${arch}): ${ollamaPath}`);
    
    return ollamaPath;
  }

  /**
   * Get path for Ollama models storage
   */
  private getOllamaModelsPath(): string {
    return path.join(app.getPath("userData"), "ollama", "models");
  }

  /**
   * Get path to bundled Tesseract binary
   * @returns Path to the Tesseract executable for the current platform and architecture
   * @throws Error if platform is unsupported
   */
  private getTesseractBinaryPath(): string {
    let folderPath = "";
    if (app.isPackaged) {
      folderPath = path.join(process.resourcesPath, "tesseract");
    } else {
      folderPath = path.join(__dirname, "../../extraResources", "tesseract");
    }

    // Detect platform and architecture
    const arch = process.arch; // 'x64', 'arm64', etc.
    let platformFolder = "";
    let fileName = "";
    
    if (process.platform === "win32") {
      platformFolder = `win32-${arch}`;
      fileName = "tesseract.exe";
    } else if (process.platform === "darwin") {
      platformFolder = `darwin-${arch}`;
      fileName = "tesseract";
    } else if (process.platform === "linux") {
      platformFolder = `linux-${arch}`;
      fileName = "tesseract";
    } else {
      const errorMsg = `Unsupported platform for Tesseract: ${process.platform}`;
      log(errorMsg);
      throw new Error(errorMsg);
    }

    const tesseractPath = path.join(folderPath, platformFolder, fileName);
    log(`Resolved Tesseract binary path (${process.platform}-${arch}): ${tesseractPath}`);
    
    return tesseractPath;
  }

  /**
   * Get path to tessdata directory
   * @returns Path to the tessdata directory for the current platform and architecture
   * @throws Error if platform is unsupported
   */
  private getTessdataPath(): string {
    let folderPath = "";
    if (app.isPackaged) {
      folderPath = path.join(process.resourcesPath, "tesseract");
    } else {
      folderPath = path.join(__dirname, "../../extraResources", "tesseract");
    }

    // Detect platform and architecture
    const arch = process.arch; // 'x64', 'arm64', etc.
    let platformFolder = "";
    
    if (process.platform === "win32") {
      platformFolder = `win32-${arch}`;
    } else if (process.platform === "darwin") {
      platformFolder = `darwin-${arch}`;
    } else if (process.platform === "linux") {
      platformFolder = `linux-${arch}`;
    } else {
      const errorMsg = `Unsupported platform for Tesseract tessdata: ${process.platform}`;
      log(errorMsg);
      throw new Error(errorMsg);
    }

    const tessdataPath = path.join(folderPath, platformFolder, "tessdata");
    log(`Resolved tessdata path (${process.platform}-${arch}): ${tessdataPath}`);
    
    return tessdataPath;
  }

  /**
   * Get path to Poppler binaries directory
   * @returns Path to the Poppler bin directory for the current platform and architecture
   * @throws Error if platform is unsupported
   */
  private getPopplerPath(): string {
    let folderPath = "";
    if (app.isPackaged) {
      folderPath = path.join(process.resourcesPath, "poppler");
    } else {
      folderPath = path.join(__dirname, "../../extraResources", "poppler");
    }

    // Detect platform and architecture
    const arch = process.arch; // 'x64', 'arm64', etc.
    let platformFolder = "";
    
    if (process.platform === "win32") {
      platformFolder = `win32-${arch}`;
    } else if (process.platform === "darwin") {
      platformFolder = `darwin-${arch}`;
    } else if (process.platform === "linux") {
      platformFolder = `linux-${arch}`;
    } else {
      const errorMsg = `Unsupported platform for Poppler: ${process.platform}`;
      log(errorMsg);
      throw new Error(errorMsg);
    }

    const popplerPath = path.join(folderPath, platformFolder, "Library", "bin");
    log(`Resolved Poppler path (${process.platform}-${arch}): ${popplerPath}`);
    
    return popplerPath;
  }

  /**
   * Start Python backend service
   */
  public async startPythonBackend(embeddingModel?: string): Promise<void> {
    if (this.pythonBackend.status === "running") {
      log("Python backend is already running");
      return;
    }

    this.pythonBackend.status = "starting";
    log("Starting Python backend service...");

    const host = `http://localhost:${this.PYTHON_PORT}`;
    
    // Check if already running
    if (await this.checkHealth(`${host}/health`)) {
      log(`Found existing Python backend on port ${this.PYTHON_PORT}`);
      this.pythonBackend.host = host;
      this.pythonBackend.status = "running";
      return;
    }

    try {
      await this.spawnPythonBackend(embeddingModel);
      this.pythonBackend.host = host;
      
      // Wait for health check
      const isHealthy = await this.waitForHealth(
        `${host}/health`,
        this.HEALTH_CHECK_TIMEOUT
      );
      
      if (isHealthy) {
        this.pythonBackend.status = "running";
        log("Python backend started successfully");
      } else {
        this.pythonBackend.status = "crashed";
        
        // Capture error details before killing process
        const errorDetails = (this.pythonBackend as any).lastError || "";
        const outputDetails = (this.pythonBackend as any).lastOutput || "";
        const criticalError = (this.pythonBackend as any).criticalError || "";
        const startupComplete = (this.pythonBackend as any).startupComplete || false;
        
        log("=== Python Backend Failed to Start ===");
        log(`Startup completed: ${startupComplete}`);
        log(`Critical error: ${criticalError || "None detected"}`);
        log(`Error output length: ${errorDetails.length} chars`);
        log(`Standard output length: ${outputDetails.length} chars`);
        
        this.killProcess(this.pythonBackend);
        
        // Determine user-friendly error message
        let userFriendlyMessage = "";
        
        if (criticalError) {
          // Use the first critical error we detected
          if (criticalError.includes("module import failed")) {
            userFriendlyMessage = "Python dependencies are missing or corrupted. Please reinstall the application.";
          } else if (criticalError.includes("Port 8000")) {
            userFriendlyMessage = "Port 8000 is already in use. Please close other applications and try again.";
          } else if (criticalError.includes("Permission denied")) {
            userFriendlyMessage = "Permission denied. Try running Pinguin as Administrator.";
          } else if (criticalError.includes("Database")) {
            userFriendlyMessage = "Database initialization failed. Try deleting %APPDATA%\\Pinguin\\chroma_db and restarting.";
          } else {
            userFriendlyMessage = criticalError;
          }
        } else if (startupComplete) {
          // Startup completed but health check still failed - likely a timing issue
          userFriendlyMessage = "The backend started but is not responding. This may be a temporary issue - please try restarting the application.";
        } else if (errorDetails.length === 0 && outputDetails.length === 0) {
          // No output at all - process died immediately
          userFriendlyMessage = "The Python backend failed to start. This is likely due to missing Visual C++ Runtime. Please install it from: https://aka.ms/vs/17/release/vc_redist.x64.exe";
        } else {
          // Generic fallback
          userFriendlyMessage = "The backend service failed to start. Please check the logs at %APPDATA%\\Pinguin\\logs\\main.log for details.";
        }
        
        // Log full technical details
        if (errorDetails) {
          log(`Full error output:\n${errorDetails}`);
        }
        if (outputDetails) {
          log(`Full standard output:\n${outputDetails}`);
        }
        
        throw new Error(userFriendlyMessage);
      }
    } catch (error: unknown) {
      this.pythonBackend.status = "crashed";
      throw new Error(`Failed to start Python backend: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Spawn Python backend process
   */
  private async spawnPythonBackend(embeddingModel?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Pre-flight checks
      const pythonPath = this.getPythonPath();
      const backendPath = this.getBackendPath();
      
      log("=== Python Backend Pre-flight Checks ===");
      log(`Python path: ${pythonPath}`);
      log(`Backend path: ${backendPath}`);
      log(`Python exists: ${fs.existsSync(pythonPath)}`);
      log(`Backend exists: ${fs.existsSync(backendPath)}`);
      log(`server.py exists: ${fs.existsSync(path.join(backendPath, "server.py"))}`);
      
      // Verify critical files exist
      if (!fs.existsSync(pythonPath)) {
        const error = `Python runtime not found at: ${pythonPath}`;
        log(`ERROR: ${error}`);
        reject(new Error(error));
        return;
      }
      
      if (!fs.existsSync(path.join(backendPath, "server.py"))) {
        const error = `Backend server.py not found at: ${path.join(backendPath, "server.py")}`;
        log(`ERROR: ${error}`);
        reject(new Error(error));
        return;
      }
      
      // Use provided embedding model or default
      const activeEmbeddingModel = embeddingModel || "nomic-embed-text:v1.5";
      log(`Using embedding model: ${activeEmbeddingModel}`);
      
      // Get Tesseract paths
      let tesseractCmd = "";
      let tessdataPrefix = "";
      
      try {
        tesseractCmd = this.getTesseractBinaryPath();
        tessdataPrefix = this.getTessdataPath();
        
        // Verify Tesseract binary exists
        if (fs.existsSync(tesseractCmd)) {
          log(`Found bundled Tesseract at: ${tesseractCmd}`);
          log(`Using tessdata from: ${tessdataPrefix}`);
        } else {
          log(`Warning: Bundled Tesseract not found at ${tesseractCmd}`);
          log("OCR functionality will attempt to use system-installed Tesseract as fallback");
          tesseractCmd = ""; // Clear to allow fallback
          tessdataPrefix = "";
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log(`Error locating Tesseract: ${errorMessage}`);
        log("OCR functionality will attempt to use system-installed Tesseract as fallback");
        // Continue without Tesseract - will use system installation if available
      }

      // Get Poppler path for pdf2image
      let popplerPath = "";
      try {
        popplerPath = this.getPopplerPath();
        
        // Verify Poppler binaries exist
        if (fs.existsSync(popplerPath)) {
          log(`Found bundled Poppler at: ${popplerPath}`);
        } else {
          log(`Warning: Bundled Poppler not found at ${popplerPath}`);
          log("OCR will attempt to use system-installed Poppler as fallback");
          popplerPath = ""; // Clear to allow fallback
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log(`Error locating Poppler: ${errorMessage}`);
        log("OCR will attempt to use system-installed Poppler as fallback");
        // Continue without Poppler - will use system installation if available
      }
      
      log(`Spawning Python backend: ${pythonPath} ${backendPath}/server.py`);
      
      // Build PATH with Poppler if available
      const pathEnv = popplerPath 
        ? `${popplerPath}${path.delimiter}${process.env.PATH || ""}`
        : process.env.PATH;
      
      const env = {
        ...process.env,
        PYTHONPATH: backendPath,
        PORT: this.PYTHON_PORT.toString(),
        PATH: pathEnv,
        EMBEDDING_MODEL: activeEmbeddingModel,
        OLLAMA_HOST: this.ollama.host || "http://localhost:11434",
        // Disable LangChain telemetry to prevent errors
        LANGCHAIN_TRACING_V2: "false",
        LANGCHAIN_ENDPOINT: "",
        LANGCHAIN_API_KEY: "",
        ...(tesseractCmd && { TESSERACT_CMD: tesseractCmd }),
        ...(tessdataPrefix && { TESSDATA_PREFIX: tessdataPrefix }),
      };

      // Capture startup errors
      let startupError = "";
      let startupOutput = "";
      let criticalError = ""; // First critical error encountered
      let startupComplete = false;
      
      const pythonProcess = spawn(
        pythonPath,
        [path.join(backendPath, "server.py")],
        {
          env,
          detached: false,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: backendPath,
        }
      );

      pythonProcess.stdout?.on("data", (data) => {
        const output = data.toString();
        startupOutput += output;
        log(`Python backend stdout: ${output}`);
        
        // Check if startup completed successfully
        if (output.includes("Application startup complete")) {
          startupComplete = true;
          log("Python backend startup sequence completed successfully");
        }
      });

      pythonProcess.stderr?.on("data", (data) => {
        const error = data.toString();
        startupError += error;
        log(`Python backend stderr: ${error}`);
        
        // Capture first critical error
        if (!criticalError) {
          if (error.includes("ModuleNotFoundError") || error.includes("ImportError")) {
            criticalError = "Python module import failed - dependencies may be missing";
            log(`CRITICAL: ${criticalError}`);
          } else if (error.includes("Errno 10048") || error.includes("address already in use")) {
            criticalError = "Port 8000 is already in use";
            log(`CRITICAL: ${criticalError}`);
          } else if (error.includes("Permission denied") || error.includes("Access is denied")) {
            criticalError = "Permission denied - try running as Administrator";
            log(`CRITICAL: ${criticalError}`);
          } else if (error.includes("ChromaDB") && error.includes("Error")) {
            criticalError = "Database initialization failed";
            log(`WARNING: ${criticalError}`);
          }
        }
      });

      pythonProcess.on("error", (error) => {
        log(`Python backend process error: ${error.message}`);
        log(`Startup error output: ${startupError}`);
        reject(new Error(`Failed to spawn Python process: ${error.message}\n${startupError}`));
      });

      pythonProcess.on("exit", (code, signal) => {
        log(`Python backend exited with code ${code} and signal ${signal}`);
        if (code !== 0 && code !== null) {
          log(`Python backend startup failed with exit code ${code}`);
          log(`Error output: ${startupError}`);
          log(`Standard output: ${startupOutput}`);
        }
        if (this.pythonBackend.status === "running") {
          this.handleServiceCrash(this.pythonBackend, "python");
        }
      });

      this.pythonBackend.process = pythonProcess;
      
      // Store error output for later retrieval
      (this.pythonBackend as any).lastError = startupError;
      (this.pythonBackend as any).lastOutput = startupOutput;
      (this.pythonBackend as any).criticalError = criticalError;
      (this.pythonBackend as any).startupComplete = startupComplete;
      
      // Register with process monitor
      const processMonitor = getProcessMonitor();
      processMonitor.registerProcess("python-backend", pythonProcess, {
        name: "python-backend",
        maxRestartAttempts: 3,
        initialBackoffMs: 2000,
        maxBackoffMs: 30000,
        onRestart: async () => {
          await this.startPythonBackend(activeEmbeddingModel);
        },
        onMaxAttemptsExceeded: () => {
          this.notifyUser("Python Backend", "Maximum restart attempts exceeded. Please restart manually.");
        },
      });
      
      resolve();
    });
  }

  /**
   * Get path to Python executable
   */
  private getPythonPath(): string {
    if (app.isPackaged) {
      // Use bundled Python runtime with architecture detection
      const arch = process.arch; // 'x64', 'arm64', etc.
      let platformFolder = "";
      
      if (process.platform === "win32") {
        platformFolder = `win32-${arch}`;
      } else if (process.platform === "darwin") {
        platformFolder = `darwin-${arch}`;
      } else if (process.platform === "linux") {
        platformFolder = `linux-${arch}`;
      } else {
        throw new Error(`Unsupported platform for Python: ${process.platform}`);
      }
      
      const pythonPath = path.join(
        process.resourcesPath,
        "python-runtime",
        platformFolder,
        process.platform === "win32" ? "python.exe" : "bin/python3"
      );
      
      log(`Resolved Python path (${process.platform}-${arch}): ${pythonPath}`);
      
      // Verify Python exists
      if (!fs.existsSync(pythonPath)) {
        throw new Error(`Python runtime not found at: ${pythonPath}`);
      }
      
      return pythonPath;
    } else {
      // Use virtual environment Python in development
      const backendPath = this.getBackendPath();
      const venvPythonPath = process.platform === "win32"
        ? path.join(backendPath, "venv", "Scripts", "python.exe")
        : path.join(backendPath, "venv", "bin", "python3");
      
      // Check if venv exists, otherwise fall back to system Python
      if (fs.existsSync(venvPythonPath)) {
        log(`Using virtual environment Python: ${venvPythonPath}`);
        return venvPythonPath;
      } else {
        log(`Virtual environment not found at ${venvPythonPath}, falling back to system Python`);
        log("Please run 'cd backend && setup_venv.bat' to set up the virtual environment");
        return process.platform === "win32" ? "python" : "python3";
      }
    }
  }

  /**
   * Get path to backend directory
   */
  private getBackendPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "backend");
    } else {
      return path.join(__dirname, "../../backend");
    }
  }

  /**
   * Check if a service is healthy by pinging its endpoint
   */
  private async checkHealth(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for service to become healthy
   */
  private async waitForHealth(
    url: string,
    timeout: number
  ): Promise<boolean> {
    const startTime = Date.now();
    let lastLogTime = 0;
    
    while (Date.now() - startTime < timeout) {
      if (await this.checkHealth(url)) {
        return true;
      }
      
      // Log progress every 5 seconds
      const elapsed = Date.now() - startTime;
      if (elapsed - lastLogTime >= 5000) {
        log(`Waiting for service health check... (${Math.round(elapsed / 1000)}s / ${timeout / 1000}s)`);
        lastLogTime = elapsed;
      }
      
      await new Promise((resolve) => setTimeout(resolve, this.HEALTH_CHECK_INTERVAL));
    }
    
    log(`Health check timed out after ${timeout / 1000} seconds`);
    return false;
  }

  /**
   * Handle service crash with exponential backoff restart
   */
  private async handleServiceCrash(
    service: ServiceConfig,
    serviceType: "ollama" | "python"
  ): Promise<void> {
    service.status = "crashed";
    log(`${service.name} crashed`);

    if (service.restartAttempts >= service.maxRestartAttempts) {
      log(
        `${service.name} exceeded max restart attempts (${service.maxRestartAttempts})`
      );
      return;
    }

    service.restartAttempts++;
    const backoffDelay = Math.pow(2, service.restartAttempts) * 1000; // Exponential backoff
    
    log(
      `Attempting to restart ${service.name} (attempt ${service.restartAttempts}/${service.maxRestartAttempts}) in ${backoffDelay}ms`
    );

    await new Promise((resolve) => setTimeout(resolve, backoffDelay));

    try {
      if (serviceType === "ollama") {
        await this.startOllama();
      } else {
        // Get embedding model from config for restart
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const ConfigStore = require("./ConfigStore").default;
          const configStore = ConfigStore.getInstance();
          const embeddingModel = configStore.get("activeEmbeddingModel");
          await this.startPythonBackend(embeddingModel);
        } catch {
          await this.startPythonBackend();
        }
      }
      service.restartAttempts = 0; // Reset on successful restart
      log(`${service.name} restarted successfully`);
    } catch (error: unknown) {
      log(`Failed to restart ${service.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Stop Ollama service
   */
  public stopOllama(): void {
    log("Stopping Ollama service");
    const processMonitor = getProcessMonitor();
    processMonitor.unregisterProcess("ollama");
    this.killProcess(this.ollama);
    this.ollama.status = "stopped";
  }

  /**
   * Stop Python backend service
   */
  public stopPythonBackend(): void {
    log("Stopping Python backend service");
    const processMonitor = getProcessMonitor();
    processMonitor.unregisterProcess("python-backend");
    this.killProcess(this.pythonBackend);
    this.pythonBackend.status = "stopped";
  }

  /**
   * Restart Python backend with new embedding model
   * Used when user changes embedding model in settings
   */
  public async restartPythonBackend(embeddingModel: string): Promise<void> {
    log(`Restarting Python backend with new embedding model: ${embeddingModel}`);
    
    try {
      // Stop the current backend
      this.stopPythonBackend();
      
      // Wait a bit for the process to fully terminate
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Start with new embedding model
      await this.startPythonBackend(embeddingModel);
      
      log("Python backend restarted successfully with new embedding model");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      log(`Failed to restart Python backend: ${errorMessage}`);
      throw new Error(`Backend restart failed: ${errorMessage}`);
    }
  }

  /**
   * Stop all services
   */
  public stopAll(): void {
    log("Stopping all services");
    this.stopOllama();
    this.stopPythonBackend();
  }

  /**
   * Kill a process
   */
  private killProcess(service: ServiceConfig): void {
    if (service.process) {
      try {
        service.process.kill();
        service.process = null;
      } catch (error: unknown) {
        log(`Error killing ${service.name} process: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }

  /**
   * Get Ollama host URL
   */
  public getOllamaHost(): string {
    return this.ollama.host;
  }

  /**
   * Get Python backend host URL
   */
  public getPythonBackendHost(): string {
    return this.pythonBackend.host;
  }

  /**
   * Check if Ollama is running
   */
  public isOllamaRunning(): boolean {
    return this.ollama.status === "running";
  }

  /**
   * Check if Python backend is running
   */
  public isPythonBackendRunning(): boolean {
    return this.pythonBackend.status === "running";
  }

  /**
   * Get service status
   */
  public getServiceStatus(service: "ollama" | "python"): string {
    return service === "ollama"
      ? this.ollama.status
      : this.pythonBackend.status;
  }

  /**
   * Get last error from Python backend for debugging
   */
  public getPythonBackendError(): { error: string; output: string } {
    return {
      error: (this.pythonBackend as any).lastError || "",
      output: (this.pythonBackend as any).lastOutput || "",
    };
  }

  /**
   * Notify user about service issues
   */
  private notifyUser(serviceName: string, message: string): void {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("process:maxAttemptsExceeded", {
        processName: serviceName,
        reason: message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export default ProcessManager;
