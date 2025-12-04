/**
 * Process monitoring and automatic restart functionality
 * Monitors Python backend and Ollama processes with exponential backoff
 */
import { ChildProcess } from "child_process";
import logger from "electron-log";
import { BrowserWindow } from "electron";
import { ErrorHandler, ErrorType, AppError } from "../errors/ErrorHandler";

export interface ProcessConfig {
  name: string;
  maxRestartAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  onRestart?: () => Promise<void>;
  onMaxAttemptsExceeded?: () => void;
}

export interface ProcessStatus {
  name: string;
  running: boolean;
  restartAttempts: number;
  lastRestartTime?: Date;
  lastError?: string;
}

/**
 * Process monitor with automatic restart and exponential backoff
 */
export class ProcessMonitor {
  private processes: Map<string, ChildProcess> = new Map();
  private configs: Map<string, ProcessConfig> = new Map();
  private restartAttempts: Map<string, number> = new Map();
  private lastRestartTime: Map<string, Date> = new Map();
  private restartTimers: Map<string, NodeJS.Timeout> = new Map();
  private errorHandler: ErrorHandler;

  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Register a process for monitoring
   */
  public registerProcess(
    name: string,
    process: ChildProcess,
    config: Partial<ProcessConfig> = {}
  ): void {
    const fullConfig: ProcessConfig = {
      name,
      maxRestartAttempts: config.maxRestartAttempts ?? 3,
      initialBackoffMs: config.initialBackoffMs ?? 1000,
      maxBackoffMs: config.maxBackoffMs ?? 30000,
      onRestart: config.onRestart,
      onMaxAttemptsExceeded: config.onMaxAttemptsExceeded,
    };

    this.processes.set(name, process);
    this.configs.set(name, fullConfig);
    this.restartAttempts.set(name, 0);

    // Monitor process exit
    process.on("exit", (code, signal) => {
      this.handleProcessExit(name, code, signal);
    });

    process.on("error", (error) => {
      this.handleProcessError(name, error);
    });

    logger.info(`Process registered for monitoring: ${name}`);
  }

  /**
   * Unregister a process from monitoring
   */
  public unregisterProcess(name: string): void {
    const timer = this.restartTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.restartTimers.delete(name);
    }

    this.processes.delete(name);
    this.configs.delete(name);
    this.restartAttempts.delete(name);
    this.lastRestartTime.delete(name);

    logger.info(`Process unregistered from monitoring: ${name}`);
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(
    name: string,
    code: number | null,
    signal: string | null
  ): void {
    logger.warn(`Process exited: ${name}`, { code, signal });

    const config = this.configs.get(name);
    if (!config) {
      return;
    }

    // Check if exit was expected (code 0 or SIGTERM)
    if (code === 0 || signal === "SIGTERM") {
      logger.info(`Process exited normally: ${name}`);
      return;
    }

    // Attempt restart
    this.attemptRestart(name, `Process exited with code ${code}`);
  }

  /**
   * Handle process error
   */
  private handleProcessError(name: string, error: Error): void {
    logger.error(`Process error: ${name}`, error);

    const config = this.configs.get(name);
    if (!config) {
      return;
    }

    this.attemptRestart(name, error.message);
  }

  /**
   * Attempt to restart a process with exponential backoff
   */
  private async attemptRestart(name: string, reason: string): Promise<void> {
    const config = this.configs.get(name);
    if (!config) {
      return;
    }

    const attempts = this.restartAttempts.get(name) || 0;

    // Check if max attempts exceeded
    if (attempts >= config.maxRestartAttempts) {
      logger.error(
        `Max restart attempts exceeded for ${name} (${attempts}/${config.maxRestartAttempts})`
      );

      // Notify user
      this.notifyMaxAttemptsExceeded(name, reason);

      // Call callback if provided
      if (config.onMaxAttemptsExceeded) {
        config.onMaxAttemptsExceeded();
      }

      return;
    }

    // Calculate backoff delay with exponential increase
    const backoffMs = Math.min(
      config.initialBackoffMs * Math.pow(2, attempts),
      config.maxBackoffMs
    );

    logger.info(
      `Scheduling restart for ${name} in ${backoffMs}ms (attempt ${attempts + 1}/${config.maxRestartAttempts})`
    );

    // Schedule restart
    const timer = setTimeout(async () => {
      try {
        logger.info(`Attempting to restart ${name}...`);

        // Increment restart attempts
        this.restartAttempts.set(name, attempts + 1);
        this.lastRestartTime.set(name, new Date());

        // Call restart callback
        if (config.onRestart) {
          await config.onRestart();
          logger.info(`Process restarted successfully: ${name}`);

          // Reset restart attempts on successful restart
          this.restartAttempts.set(name, 0);
        }
      } catch (error) {
        logger.error(`Failed to restart ${name}:`, error);
        // Will trigger another restart attempt via error handler
      }
    }, backoffMs);

    this.restartTimers.set(name, timer);
  }

  /**
   * Manually trigger a restart
   */
  public async manualRestart(name: string): Promise<void> {
    const config = this.configs.get(name);
    if (!config) {
      throw new AppError(
        `Process ${name} not registered`,
        ErrorType.PROCESS_SPAWN,
        false,
        false
      );
    }

    logger.info(`Manual restart requested for ${name}`);

    // Reset restart attempts
    this.restartAttempts.set(name, 0);

    // Clear any pending restart timers
    const timer = this.restartTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.restartTimers.delete(name);
    }

    // Attempt restart
    if (config.onRestart) {
      await config.onRestart();
      logger.info(`Process manually restarted: ${name}`);
    }
  }

  /**
   * Get status of a monitored process
   */
  public getProcessStatus(name: string): ProcessStatus | null {
    const process = this.processes.get(name);
    if (!process) {
      return null;
    }

    return {
      name,
      running: !process.killed && process.exitCode === null,
      restartAttempts: this.restartAttempts.get(name) || 0,
      lastRestartTime: this.lastRestartTime.get(name),
    };
  }

  /**
   * Get status of all monitored processes
   */
  public getAllProcessStatuses(): ProcessStatus[] {
    const statuses: ProcessStatus[] = [];

    for (const name of this.processes.keys()) {
      const status = this.getProcessStatus(name);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Reset restart attempts for a process
   */
  public resetRestartAttempts(name: string): void {
    this.restartAttempts.set(name, 0);
    logger.info(`Reset restart attempts for ${name}`);
  }

  /**
   * Notify user that max restart attempts have been exceeded
   */
  private notifyMaxAttemptsExceeded(name: string, reason: string): void {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("process:maxAttemptsExceeded", {
        processName: name,
        reason,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Cleanup all monitoring
   */
  public cleanup(): void {
    // Clear all timers
    for (const timer of this.restartTimers.values()) {
      clearTimeout(timer);
    }

    this.processes.clear();
    this.configs.clear();
    this.restartAttempts.clear();
    this.lastRestartTime.clear();
    this.restartTimers.clear();

    logger.info("Process monitor cleaned up");
  }
}

// Singleton instance
let processMonitorInstance: ProcessMonitor | null = null;

export function getProcessMonitor(): ProcessMonitor {
  if (!processMonitorInstance) {
    processMonitorInstance = new ProcessMonitor();
  }
  return processMonitorInstance;
}
