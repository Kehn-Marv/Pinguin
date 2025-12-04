import { ipcRenderer, type IpcRendererEvent } from "electron";

const ollama = {
  isReady: (): Promise<boolean> => ipcRenderer.invoke("ollama:isReady"),
  initialize: (): Promise<any> => ipcRenderer.invoke("ollama:initialize"),
  getStatus: (): Promise<any> => ipcRenderer.invoke("ollama:get-status"),
  stop: (): Promise<any> => ipcRenderer.invoke("ollama:stop"),
  subscribeToReady: (listener: (_event: IpcRendererEvent) => void) => {
    ipcRenderer.on("ollama:ready", listener);
  },
  unsubscribeFromReady: () => {
    // Warning: Removing ALL listeners may cause unintended side effects
    ipcRenderer.removeAllListeners("ollama:ready");
  },
};

export type IOllamaAPI = typeof ollama;
export default ollama;
