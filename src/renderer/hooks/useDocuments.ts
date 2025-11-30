import { useState, useEffect, useCallback } from "react";
import { useElectron } from "./useElectron";

interface UseDocumentsResult {
  documents: Doc[];
  isLoading: boolean;
  error: string | null;
  uploadDocument: (courseId: string) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  refreshDocuments: (courseId: string) => Promise<void>;
}

export const useDocuments = (courseId: string): UseDocumentsResult => {
  const api = useElectron();
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load documents on mount and when courseId changes
  useEffect(() => {
    loadDocuments();
  }, [courseId]);

  // Subscribe to document updates
  useEffect(() => {
    api.document.subuscribeToCourseDocuments(courseId, (docs: Doc[]) => {
      setDocuments(docs);
    });

    return () => {
      api.document.unsubscribeFromCourseDocuments(courseId);
    };
  }, [courseId, api]);

  const loadDocuments = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const docs = await api.document.getAllByCourse(courseId);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  };

  const uploadDocument = useCallback(async (courseId: string) => {
    setError(null);
    
    try {
      // Use empty string for chatId to indicate course-level import
      await api.document.import(courseId, "");
      // Documents will be updated via subscription
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
    }
  }, [api]);

  const deleteDocument = useCallback(async (documentId: string) => {
    setError(null);
    
    try {
      await api.document.delete(documentId);
      // Documents will be updated via subscription
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document");
    }
  }, [api]);

  const refreshDocuments = useCallback(async () => {
    await loadDocuments();
  }, []);

  return {
    documents,
    isLoading,
    error,
    uploadDocument,
    deleteDocument,
    refreshDocuments,
  };
};
