import { webContents } from "electron";
import ChatSearchEngine from "../search/chatSearchEngine";
import PartialMessageManager from "./partialMessageManager";

export const notifyCompleteMessage = (
  courseId: string,
  chatId: string,
  message: Message
) => {
  const windows = webContents.getAllWebContents();
  windows.forEach((webContents) => {
    webContents.send(`message:update:complete:${courseId}:${chatId}`, message);
  });
  
  // Update search index incrementally
  ChatSearchEngine.updateIndexForNewMessage(courseId, chatId, message);
};

export const notifyLoadingMessage = (
  courseId: string,
  chatId: string,
  isLoading: boolean
) => {
  const windows = webContents.getAllWebContents();
  windows.forEach((webContents) => {
    webContents.send(
      `message:update:loading:${courseId}:${chatId}`,
      isLoading
    );
  });
}

export const notifyPartialMessage = (courseId: string, chatId: string, message: string) => {
  // Store the partial message for retrieval when switching chats
  const partialMessageManager = PartialMessageManager.getInstance();
  partialMessageManager.setPartialMessage(courseId, chatId, message);
  
  // Notify all windows
  const windows = webContents.getAllWebContents();
  windows.forEach((webContents) => {
    webContents.send(`message:update:partial:${courseId}:${chatId}`, message);
  });
}

export const notifySlowResponse = (courseId: string, chatId: string, isSlowResponse: boolean) => {
  const windows = webContents.getAllWebContents();
  windows.forEach((webContents) => {
    webContents.send(`message:update:slowResponse:${courseId}:${chatId}`, isSlowResponse);
  });
}