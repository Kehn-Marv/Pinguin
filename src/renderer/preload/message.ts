import { ipcRenderer, type IpcRendererEvent } from "electron";

const message = {
  getMessages: (courseId: string, chatId: string, limit?: number, offset?: number) => {
    return ipcRenderer.invoke("message:get", courseId, chatId, limit, offset);
  },
  getMessageCount: (courseId: string, chatId: string) => {
    return ipcRenderer.invoke("message:count", courseId, chatId);
  },
  isLoadingMessage: (courseId: string, chatId: string) => {
    return ipcRenderer.invoke("message:isLoading", courseId, chatId);
  },
  getPartialMessage: (courseId: string, chatId: string) => {
    return ipcRenderer.invoke("message:getPartialMessage", courseId, chatId);
  },
  sendMessage: (courseId: string, chatId: string, message: string, mode?: "thinking" | "coding", documentIds?: string[]) => {
    return ipcRenderer.invoke("message:send", courseId, chatId, message, mode, documentIds);
  },
  cancelMessage: (courseId: string, chatId: string) => {
    return ipcRenderer.invoke("message:cancel", courseId, chatId);
  },
  subscribeToIsLoadingMessage: (
    courseId: string,
    chatId: string,
    listener: (_event: IpcRendererEvent, isLoading: boolean) => void
  ) => {
    ipcRenderer.on(`message:update:loading:${courseId}:${chatId}`, listener);
  },
  unsubscribeFromIsLoadingMessage: (courseId: string, chatId: string) => {
    // Warning: Removing ALL listeners may cause unintended side effects
    ipcRenderer.removeAllListeners(
      `message:update:loading:${courseId}:${chatId}`
    );
  },
  subscribeToCompleteMessage: (
    courseId: string,
    chatId: string,
    listener: (_event: IpcRendererEvent, message: Message) => void
  ) => {
    ipcRenderer.on(`message:update:complete:${courseId}:${chatId}`, listener);
  },
  unsubscribeFromCompleteMessage: (courseId: string, chatId: string) => {
    // Warning: Removing ALL listeners may cause unintended side effects
    ipcRenderer.removeAllListeners(
      `message:update:complete:${courseId}:${chatId}`
    );
  },
  subscribeToPartialMessage: (
    courseId: string,
    chatId: string,
    listener: (_event: IpcRendererEvent, message: string) => void
  ) => {
    ipcRenderer.on(`message:update:partial:${courseId}:${chatId}`, listener);
  },
  unsubscribeFromPartialMessage: (courseId: string, chatId: string) => {
    // Warning: Removing ALL listeners may cause unintended side effects
    ipcRenderer.removeAllListeners(
      `message:update:partial:${courseId}:${chatId}`
    );
  },
  subscribeToSlowResponse: (
    courseId: string,
    chatId: string,
    listener: (_event: IpcRendererEvent, isSlowResponse: boolean) => void
  ) => {
    ipcRenderer.on(`message:update:slowResponse:${courseId}:${chatId}`, listener);
  },
  unsubscribeFromSlowResponse: (courseId: string, chatId: string) => {
    ipcRenderer.removeAllListeners(
      `message:update:slowResponse:${courseId}:${chatId}`
    );
  },
};

export type IMessageAPI = typeof message;
export default message;
