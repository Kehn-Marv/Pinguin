import React from "react";
import { Button } from "@mui/material";
import { Upload } from "@mui/icons-material";
import importDocuments from "../backend/documents/importDocuments";

type PropsType = {
  courseId: string;
  chatId?: string;
};

const ImportDocumentButton = ({ courseId, chatId }: PropsType) => {
  const handleImport = () => {
    // Use a special "course-level" chatId for backward compatibility
    // In the future, this should always be called from within a chat context
    const effectiveChatId = chatId || "course-level";
    importDocuments(courseId, effectiveChatId);
  };

  return (
    <Button startIcon={<Upload />} variant={"outlined"} onClick={handleImport}>
      Import
    </Button>
  );
};

export default ImportDocumentButton;
