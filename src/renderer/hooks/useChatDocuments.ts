import { useEffect, useState } from "react";

const useChatDocuments = (courseId: string) => {
  const [hasDocuments, setHasDocuments] = useState(false);
  const [documentCount, setDocumentCount] = useState(0);

  useEffect(() => {
    const checkDocuments = async () => {
      if (courseId) {
        try {
          const docs = await window.api.document.getAllByCourse(courseId);
          setHasDocuments(docs.length > 0);
          setDocumentCount(docs.length);
        } catch (error) {
          console.error("Failed to check documents:", error);
          setHasDocuments(false);
          setDocumentCount(0);
        }
      }
    };

    checkDocuments();

    // Subscribe to document updates
    const handleDocumentUpdate = (docs: Doc[]) => {
      setHasDocuments(docs.length > 0);
      setDocumentCount(docs.length);
    };

    window.api.document.subuscribeToCourseDocuments(courseId, handleDocumentUpdate);

    return () => {
      window.api.document.unsubscribeFromCourseDocuments(courseId);
    };
  }, [courseId]);

  return { hasDocuments, documentCount };
};

export default useChatDocuments;
