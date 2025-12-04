import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  TextField,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  Typography,
  CircularProgress,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { useQuery } from "../../hooks/useQuery";
import { useApp, StudyMode } from "../../context/AppContext";
import { MessageList } from "./";
import { ErrorMessage } from "../ErrorMessage";
import { useErrorHandler } from "../../hooks/useErrorHandler";
import useScrollbarStyle from "../../UI/useScrollbarStyle";
import { useParams } from "react-router-dom";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Array<{ documentTitle: string; text: string }>;
}

const ChatInterface: React.FC = () => {
  const scrollbarStyle = useScrollbarStyle();
  const { courseId, chatId } = useParams<{ courseId: string; chatId: string }>();
  const { studyMode, setStudyMode } = useApp();
  const { response, isLoading, error, sources, submitQuery } = useQuery(courseId || "", chatId || "");
  const { error: errorState, handleError, clearError } = useErrorHandler();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle errors from useQuery
  useEffect(() => {
    if (error) {
      handleError(error);
    }
  }, [error, handleError]);

  // Update current response as tokens stream in
  useEffect(() => {
    setCurrentResponse(response);
  }, [response]);

  // Add assistant message when response is complete
  useEffect(() => {
    if (!isLoading && currentResponse && sources.length > 0) {
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: currentResponse,
        timestamp: new Date(),
        sources: sources,
      };
      setMessages(prev => [...prev, assistantMessage]);
      setCurrentResponse("");
    }
  }, [isLoading, currentResponse, sources]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading || !courseId || !chatId) return;

    // Clear any previous errors
    clearError();

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");

    // Submit query
    try {
      await submitQuery(courseId, chatId, inputValue);
    } catch (err) {
      handleError(err);
    }
  };

  const handleRetry = () => {
    clearError();
    if (messages.length > 0) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
      if (lastUserMessage && courseId && chatId) {
        submitQuery(courseId, chatId, lastUserMessage.content);
      }
    }
  };

  const handleViewLogs = async () => {
    try {
      await window.api.error.openLogs();
    } catch (err) {
      console.error("Failed to open logs:", err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModeChange = (mode: StudyMode) => {
    setStudyMode(mode);
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* Mode Selector */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Study Mode</InputLabel>
          <Select
            value={studyMode}
            label="Study Mode"
            onChange={(e) => handleModeChange(e.target.value as StudyMode)}
          >
            <MenuItem value="files">
              <Box>
                <Typography variant="body2" fontWeight="bold">Files Mode</Typography>
                <Typography variant="caption" color="text.secondary">
                  Document-based Q&A with citations
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem value="coding">
              <Box>
                <Typography variant="body2" fontWeight="bold">Coding Mode</Typography>
                <Typography variant="caption" color="text.secondary">
                  Code examples and technical details
                </Typography>
              </Box>
            </MenuItem>
            <MenuItem value="thinking">
              <Box>
                <Typography variant="body2" fontWeight="bold">Thinking Mode</Typography>
                <Typography variant="caption" color="text.secondary">
                  Deep reasoning and concept exploration
                </Typography>
              </Box>
            </MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          ...scrollbarStyle,
        }}
      >
        {errorState.error && (
          <ErrorMessage
            error={errorState.error}
            errorType={errorState.errorType || undefined}
            recoverable={errorState.recoverable}
            retryable={errorState.retryable}
            onRetry={errorState.retryable ? handleRetry : undefined}
            onViewLogs={handleViewLogs}
            onDismiss={clearError}
            showDetails={true}
          />
        )}

        <MessageList messages={messages} />

        {/* Streaming response */}
        {isLoading && currentResponse && (
          <Paper
            elevation={1}
            sx={{
              p: 2,
              mb: 2,
              backgroundColor: "background.paper",
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Assistant
            </Typography>
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
              {currentResponse}
              <Box
                component="span"
                sx={{
                  display: "inline-block",
                  width: "8px",
                  height: "16px",
                  backgroundColor: "primary.main",
                  ml: 0.5,
                  animation: "blink 1s infinite",
                  "@keyframes blink": {
                    "0%, 50%": { opacity: 1 },
                    "51%, 100%": { opacity: 0 },
                  },
                }}
              />
            </Typography>
          </Paper>
        )}

        {/* Loading indicator */}
        {isLoading && !currentResponse && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Searching documents and generating response...
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about your documents..."
            disabled={isLoading}
            variant="outlined"
            size="small"
          />
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            sx={{ mb: 0.5 }}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatInterface;
