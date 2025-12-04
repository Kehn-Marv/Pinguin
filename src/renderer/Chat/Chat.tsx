import React from "react";
import { Box } from "@mui/material";
import useScrollbarStyle from "../UI/useScrollbarStyle";
import NewSubmitButton from "./NewSubmitButton";
import ChatList from "./ChatList";
import EmptyState from "./EmptyState";
import requiresLLM from "../Requirers/RequiresLLM";
import requiresEmbeddings from "../Requirers/RequiresEmbeddings";
import useMessages from "../backend/useMessages";
import useIsLoadingMessage from "../backend/useIsLoadingMessage";
import usePartialMessage from "../backend/usePartialMessage";
import { useParams } from "react-router-dom";

const Chat = () => {
  const scrollbarStyle = useScrollbarStyle();
  const { courseId, chatId } = useParams<{ courseId: string; chatId: string }>();
  const { messages } = useMessages({ courseId: courseId || "", chatId: chatId || "" });
  const loading = useIsLoadingMessage({ courseId: courseId || "", chatId: chatId || "" });
  const partialMessage = usePartialMessage({ courseId: courseId || "", chatId: chatId || "" });

  // Debug logging to help troubleshoot chat switching
  console.log(`[Chat] Rendering chat ${chatId}:`, {
    courseId,
    chatId,
    messagesCount: messages.length,
    loading,
    partialMessageLength: partialMessage?.length || 0,
    showEmptyState: messages.length === 0 && !loading && !partialMessage
  });

  // Use chatId as key to force re-render when switching chats
  // This prevents state leakage between different chats
  return (
    <Box
      key={`chat-${courseId}-${chatId}`}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        position: "relative",
      }}
    >
      {/* Chat messages area */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          overflow: "auto",
          width: "100%",
          ...scrollbarStyle,
        }}
      >
        {messages.length === 0 && !loading && !partialMessage ? (
          <EmptyState key={`empty-${chatId}`} />
        ) : (
          <ChatList key={`list-${chatId}`} />
        )}
      </Box>

      {/* Input area */}
      <Box
        sx={{
          width: "100%",
          maxWidth: "800px",
          display: "flex",
          justifyContent: "center",
          flexDirection: "column",
          px: 3,
          py: 3,
        }}
      >
        <NewSubmitButton key={`input-${chatId}`} />
      </Box>
    </Box>
  );
};

export default requiresLLM(requiresEmbeddings(Chat));
