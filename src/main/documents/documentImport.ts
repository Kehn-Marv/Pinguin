import { readPaths } from "./pathsReader";
import documentsDB from "./documentsDB";
import logger from "electron-log";
import documentImportStateManager from "./documentImportStateManager";
import axios from "axios";

export const importDocuments = async (courseID: string, chatID: string): Promise<void> => {
  const documents = await initializeStage(courseID, chatID);
  for (const document of documents) {
    await ingestToBackend(document);
    documentImportStateManager.removeDocumentFromImporting(document.id);
  }
};

const initializeStage = async (courseID: string, chatID: string): Promise<Doc[]> => {
  logger.info(`Importing documents for course ${courseID} and chat ${chatID}`);
  const paths = await readPaths();
  logger.info(`Found ${paths.length} documents`);
  const documents = paths.map((path) =>
    documentsDB.createDocument(path, courseID, chatID)
  );
  for (const document of documents) {
    documentImportStateManager.addDocumentToImporting(document.id);
  }
  return documents;
};

const ingestToBackend = async (document: Doc): Promise<void> => {
  logger.info(`Ingesting document ${document.id} to backend`);
  
  // Update all stages to "In Progress"
  documentImportStateManager.updateDocumentImportState(document.id, "Parse", "In Progress");
  documentImportStateManager.updateDocumentImportState(document.id, "Split", "In Progress");
  documentImportStateManager.updateDocumentImportState(document.id, "Embed", "In Progress");
  documentImportStateManager.updateDocumentImportState(document.id, "Save Excerpts", "In Progress");
  
  try {
    // Send document to Python backend - it will handle everything
    const response = await axios.post("http://localhost:8000/ingest", {
      file_path: document.path,
      doc_id: document.id,
      metadata: {
        documentTitle: document.title,
        courseId: document.courseId,
        chatId: document.chatId,
        docType: document.docType,
      }
    });
    
    logger.info(`Document ${document.id} ingested successfully. Chunks created: ${response.data.chunks_created}`);
    
    // Mark all stages as finished
    documentImportStateManager.updateDocumentImportState(document.id, "Parse", "Finished");
    documentImportStateManager.updateDocumentImportState(document.id, "Split", "Finished");
    documentImportStateManager.updateDocumentImportState(document.id, "Embed", "Finished");
    documentImportStateManager.updateDocumentImportState(document.id, "Save Excerpts", "Finished");
    
  } catch (error) {
    logger.error(`Failed to ingest document ${document.id} to backend:`, error);
    throw error;
  }
};
