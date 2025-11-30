import { ipcRenderer } from "electron";

const context = {
  /**
   * Restores conversation context for a chat
   */
  restore: (courseId: string, chatId: string) => {
    return ipcRenderer.invoke("context:restore", courseId, chatId);
  },

  /**
   * Clears conversation context for a chat
   */
  clear: (courseId: string, chatId: string) => {
    return ipcRenderer.invoke("context:clear", courseId, chatId);
  },

  /**
   * Gets context statistics for a chat
   */
  getStats: (courseId: string, chatId: string) => {
    return ipcRenderer.invoke("context:stats", courseId, chatId);
  },

  /**
   * Preloads contexts for multiple chats (optimization)
   */
  preload: (courseId: string, chatIds: string[]) => {
    return ipcRenderer.invoke("context:preload", courseId, chatIds);
  },
};

export type IContextAPI = typeof context;
export default context;
