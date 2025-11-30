import { ipcRenderer } from "electron";

export interface ISearchAPI {
  searchChats: (query: string, courseId: string) => Promise<SearchResult[]>;
  rebuildIndex: (courseId: string) => Promise<void>;
  getStats: (courseId: string) => Promise<{
    chatCount: number;
    messageCount: number;
    lastIndexed?: Date;
  } | null>;
}

export interface SearchResult {
  chatId: string;
  chatTitle: string;
  matchType: "exact-title" | "partial-title" | "content";
  matchedContent?: string;
  matchedTerms?: string[];
  relevanceScore: number;
  timestamp?: Date;
}

export const searchAPI: ISearchAPI = {
  searchChats: (query: string, courseId: string) =>
    ipcRenderer.invoke("search:chats", query, courseId),
  
  rebuildIndex: (courseId: string) =>
    ipcRenderer.invoke("search:rebuildIndex", courseId),
  
  getStats: (courseId: string) =>
    ipcRenderer.invoke("search:getStats", courseId),
};
