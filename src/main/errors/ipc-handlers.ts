/**
 * IPC handlers for error handling and process management
 */
import { ipcMain } from "electron";
import logger from "electron-log";
import { getProcessMonitor } from "../processes/ProcessMonitor";
import { ErrorHandler } from "./ErrorHandler";

const errorHandler = ErrorHandler.getInstance();
const processMonitor = getProcessMonitor();

/**
 * Register error handling IPC handlers
 */
export function registerErrorIPCHandlers(): void {
  /**
   * Get process statuses
   */
  ipcMain.handle("process:getStatuses", async () => {
    try {
      const statuses = processMonitor.getAllProcessStatuses();
      return { success: true, statuses };
    } catch (error) {
      logger.error("Failed to get process statuses:", error);
      return errorHandler.handleError(error);
    }
  });

  /**
   * Get specific process status
   */
  ipcMain.handle("process:getStatus", async (event, processName: string) => {
    try {
      const status = processMonitor.getProcessStatus(processName);
      if (!status) {
        return {
          success: false,
          error: `Process ${processName} not found`,
        };
      }
      return { success: true, status };
    } catch (error) {
      logger.error(`Failed to get status for ${processName}:`, error);
      return errorHandler.handleError(error);
    }
  });

  /**
   * Manually restart a process
   */
  ipcMain.handle("process:restart", async (event, processName: string) => {
    try {
      logger.info(`Manual restart requested for ${processName}`);
      await processMonitor.manualRestart(processName);
      return { success: true, message: `${processName} restarted successfully` };
    } catch (error) {
      logger.error(`Failed to restart ${processName}:`, error);
      return errorHandler.handleError(error);
    }
  });

  /**
   * Reset restart attempts for a process
   */
  ipcMain.handle("process:resetAttempts", async (event, processName: string) => {
    try {
      processMonitor.resetRestartAttempts(processName);
      return { success: true, message: `Restart attempts reset for ${processName}` };
    } catch (error) {
      logger.error(`Failed to reset attempts for ${processName}:`, error);
      return errorHandler.handleError(error);
    }
  });

  /**
   * Get application logs
   */
  ipcMain.handle("logs:getPath", async () => {
    try {
      const logPath = logger.transports.file.getFile().path;
      return { success: true, path: logPath };
    } catch (error) {
      logger.error("Failed to get log path:", error);
      return errorHandler.handleError(error);
    }
  });

  /**
   * Open logs in external viewer
   */
  ipcMain.handle("logs:open", async () => {
    try {
      const { shell } = await import("electron");
      const logPath = logger.transports.file.getFile().path;
      await shell.openPath(logPath);
      return { success: true };
    } catch (error) {
      logger.error("Failed to open logs:", error);
      return errorHandler.handleError(error);
    }
  });

  logger.info("Error handling IPC handlers registered");
}
