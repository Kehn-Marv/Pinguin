import { ipcRenderer } from "electron";

export interface StartupProgress {
  status: string;
  message: string;
  progress: number;
  error?: string;
}

const startup = {
  /**
   * Listen for startup progress updates
   */
  onStartupProgress: (callback: (progress: StartupProgress) => void) => {
    const listener = (_event: any, progress: StartupProgress) => {
      callback(progress);
    };
    ipcRenderer.on("startup:progress", listener);
    
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener("startup:progress", listener);
    };
  },

  /**
   * Get current startup status
   */
  getStartupStatus: async (): Promise<string> => {
    return ipcRenderer.invoke("startup:getStatus");
  },

  /**
   * Check if application is ready
   */
  isReady: async (): Promise<boolean> => {
    return ipcRenderer.invoke("startup:isReady");
  },
};

export default startup;
