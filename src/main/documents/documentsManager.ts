import documentsDB from "./documentsDB";
import { shell } from "electron";
import logger from "electron-log";
import documentImportStateManager from "./documentImportStateManager";
import axios from "axios";

export { importDocuments } from "./documentImport";

export const getDocumentsByCourse = async (courseID: string) => {
  logger.info(`Getting documents for course ${courseID}`);
  const documents = documentsDB.getDocumentsByCourseId(courseID);
  logger.info(`Found ${documents.length} documents for course ${courseID}`);
  return documents;
};

export const getDocumentsByChat = async (chatID: string) => {
  logger.info(`Getting documents for chat ${chatID}`);
  const documents = documentsDB.getDocumentsByChatId(chatID);
  logger.info(`Found ${documents.length} documents for chat ${chatID}`);
  return documents;
};

export const getDocument = async (docID: string) => {
  logger.info(`Getting document ${docID}`);
  const document = documentsDB.getDocumentById(docID);
  if (!document) {
    logger.error(`Document ${docID} not found`);
  }
  return document;
};

export const searchExcerpts = async (query: string, courseID: string, chatID: string) => {
  logger.info(
    `Searching for excerpts for query ${query} in course ${courseID} and chat ${chatID}`
  );
  const startTimestamp = Date.now();
  
  try {
    // Query Python backend (ChromaDB)
    // Lower similarity threshold to 0.15 to capture more relevant results
    const response = await axios.post("http://localhost:8000/query", {
      query,
      top_k: 5,
      mode: "files",
      similarity_threshold: 0.15,
    });
    
    const endTimestamp = Date.now();
    logger.info(`Retrieved ${response.data.chunks.length} excerpts in ${endTimestamp - startTimestamp}ms`);
    
    // Convert backend response to Excerpt format
    // Filter by courseId and chatId on the client side since backend doesn't support filters yet
    interface BackendChunk {
      text: string;
      metadata: {
        documentTitle?: string;
        filename?: string;
        doc_id: string;
        courseId?: string;
        chatId?: string;
      };
    }
    
    const excerpts: Excerpt[] = response.data.chunks
      .filter((chunk: any) => {
        const metadata = chunk.metadata;
        return (
          (!metadata.courseId || metadata.courseId === courseID) &&
          (!metadata.chatId || metadata.chatId === chatID)
        );
      })
      .map((chunk: BackendChunk) => ({
        text: chunk.text,
        documentTitle: chunk.metadata.documentTitle || chunk.metadata.filename || "Unknown",
        documentId: chunk.metadata.doc_id,
        courseId: chunk.metadata.courseId || courseID,
        chatId: chunk.metadata.chatId || chatID,
        embeddings: [],
      }));
    
    return excerpts;
  } catch (error) {
    logger.error(`Failed to search excerpts from backend:`, error);
    return [];
  }
};

export const openDocument = async (docID: string) => {
  logger.info(`Opening document ${docID}`);
  const document = documentsDB.getDocumentById(docID);
  if (document) {
    shell.openPath(document.path);
  } else {
    logger.error(`Document ${docID} not found`);
  }
};

export const deleteDocument = async (docID: string) => {
  logger.info(`Deleting document ${docID}`);
  documentsDB.deleteDocument(docID);
  
  try {
    // Delete from ChromaDB via backend
    await axios.delete(`http://localhost:8000/documents/${docID}`);
    logger.info(`Deleted document ${docID} from ChromaDB`);
  } catch (error) {
    logger.error(`Failed to delete document from backend:`, error);
  }
};

export const deleteCourse = async (courseID: string) => {
  logger.info(
    `Deleting all documents and excerpts related to course ${courseID}`
  );
  const documents = documentsDB.getDocumentsByCourseId(courseID);
  documentsDB.deleteDocumentsByCourseId(courseID);
  
  // Delete each document from ChromaDB
  for (const doc of documents) {
    try {
      await axios.delete(`http://localhost:8000/documents/${doc.id}`);
      logger.info(`Deleted document ${doc.id} from ChromaDB`);
    } catch (error) {
      logger.error(`Failed to delete document ${doc.id} from backend:`, error);
    }
  }
};

export const deleteChat = async (chatID: string) => {
  logger.info(
    `Deleting all documents and excerpts related to chat ${chatID}`
  );
  const documents = documentsDB.getDocumentsByChatId(chatID);
  documentsDB.deleteDocumentsByChatId(chatID);
  
  // Delete each document from ChromaDB
  for (const doc of documents) {
    try {
      await axios.delete(`http://localhost:8000/documents/${doc.id}`);
      logger.info(`Deleted document ${doc.id} from ChromaDB`);
    } catch (error) {
      logger.error(`Failed to delete document ${doc.id} from backend:`, error);
    }
  }
};

export const renameDocument = async (docID: string, newName: string) => {
  logger.info(`Renaming document ${docID} to ${newName}`);
  documentsDB.renameDocument(docID, newName);
  
  // Note: Backend doesn't support renaming yet
  // Metadata is stored in the document store, so renaming locally is sufficient
  logger.info(`Document ${docID} renamed locally to ${newName}`);
};

export const getDocumentImportState = async (
  docID: string
): Promise<DocumentImportState> => {
  logger.info(`Getting import state for document ${docID}`);
  return documentImportStateManager.getDocumentState(docID);
};

export const deleteAllCurrentlyImportingDocuments = async () => {
  logger.info("Deleting all documents currently being imported");
  const documentIDs = documentImportStateManager.getAllLoadingDocuments();
  const promises = documentIDs.map((docID) => deleteDocument(docID));
  await Promise.all(promises);
};
