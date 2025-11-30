import React, { useState } from "react";
import { IconButton, InputAdornment, OutlinedInput } from "@mui/material";
import { useParams } from "react-router-dom";
import { Send } from "@mui/icons-material";
import useIsLoadingMessage from "../backend/useIsLoadingMessage";

const SubmitButton = () => {
  const { courseId, chatId } = useParams<{ courseId: string; chatId: string }>();
  const [question, setQuestion] = useState<string>("");
  const loading = useIsLoadingMessage({ courseId: courseId!, chatId: chatId! });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (courseId && chatId) {
      window.api.message.sendMessage(courseId, chatId, question);
      setQuestion("");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <OutlinedInput
        autoFocus
        placeholder="Ask Pinguin anything"
        disabled={loading}
        fullWidth={true}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        endAdornment={
          <InputAdornment position="end">
            <IconButton
              disabled={loading || question === ""}
              type="submit"
              color="primary"
            >
              <Send />
            </IconButton>
          </InputAdornment>
        }
      />
    </form>
  );
};

export default SubmitButton;
