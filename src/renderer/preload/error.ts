/**
 * Preload script for error handling and process management
 */
import { ipcRenderer } from "electron";

export default {
  /**
   * Get all process statuses
   */
  getProcessStatuses: () => ipcRenderer.invoke("process:getStatuses"),

  /**
   * Get specific process status
   */
  getProcessStatus: (processName: string) =>
    ipcRenderer.invoke("process:getStatus", processName),

  /**
   * Manually restart a process
   */
  restartProcess: (processName: string) =>
    ipcRenderer.invoke("process:restart", processName),

  /**
   * Reset restart attempts for a process
   */
  resetRestartAttempts: (processName: string) =>
    ipcRenderer.invoke("process:resetAttempts", processName),

  /**
   * Get log file path
   */
  getLogPath: () => ipcRenderer.invoke("logs:getPath"),

  /**
   * Open logs in external viewer
   */
  openLogs: () => ipcRenderer.invoke("logs:open"),

  /**
   * Listen for process max attempts exceeded events
   */
  onMaxAttemptsExceeded: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on("process:maxAttemptsExceeded", listener);
    return () => {
      ipcRenderer.removeListener("process:maxAttemptsExceeded", listener);
    };
  },

  /**
   * Listen for error events
   */
  onError: (callback: (error: any) => void) => {
    const listener = (_event: any, error: any) => callback(error);
    ipcRenderer.on("error:occurred", listener);
    return () => {
      ipcRenderer.removeListener("error:occurred", listener);
    };
  },
};
