import {
  deleteDocument,
  getDocument,
  getDocumentsByCourse,
  getDocumentsByChat,
  importDocuments,
  openDocument,
  renameDocument,
  getDocumentImportState,
} from "./documentsManager";
import { ipcMain } from "electron";
import { registerFileUploadIPCHandlers } from "./ipc-handlers";

ipcMain.handle("document:get", async (event, documentId) => {
  return getDocument(documentId);
});

ipcMain.handle("document:getAllByCourse", async (event, courseId) => {
  return getDocumentsByCourse(courseId);
});

ipcMain.handle("document:getAllByChat", async (event, chatId) => {
  return getDocumentsByChat(chatId);
});

ipcMain.handle("document:import", (event, courseId, chatId) => {
  importDocuments(courseId, chatId);
});

ipcMain.handle("document:rename", (event, documentId, newName) => {
  renameDocument(documentId, newName);
});

ipcMain.handle("document:delete", (event, documentId) => {
  deleteDocument(documentId);
});

ipcMain.handle("document:open", (event, documentId) => {
  return openDocument(documentId);
});

ipcMain.handle("document:importState", (event, documentId) => {
  return getDocumentImportState(documentId);
});

// Register file upload IPC handlers
registerFileUploadIPCHandlers();

export {
  searchExcerpts,
  deleteCourse,
  deleteChat,
  deleteAllCurrentlyImportingDocuments,
} from "./documentsManager";

export { default as FileUploadManager } from "./fileUploadManager";
