import React from "react";
import { Box, Paper, Typography, Chip, Collapse, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import PersonIcon from "@mui/icons-material/Person";
import SmartToyIcon from "@mui/icons-material/SmartToy";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Array<{ documentTitle: string; text: string }>;
}

interface MessageListProps {
  messages: ChatMessage[];
}

const MessageItem: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const [showSources, setShowSources] = React.useState(false);
  const isUser = message.role === "user";

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        mb: 2,
      }}
    >
      <Paper
        elevation={1}
        sx={{
          p: 2,
          maxWidth: "80%",
          backgroundColor: isUser ? "primary.main" : "background.paper",
          color: isUser ? "primary.contrastText" : "text.primary",
        }}
      >
        {/* Message Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          {isUser ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            {isUser ? "You" : "Assistant"}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.6, ml: "auto" }}>
            {message.timestamp.toLocaleTimeString()}
          </Typography>
        </Box>

        {/* Message Content */}
        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
          {message.content}
        </Typography>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                cursor: "pointer",
              }}
              onClick={() => setShowSources(!showSources)}
            >
              <Typography variant="caption" fontWeight="bold">
                Sources ({message.sources.length})
              </Typography>
              <IconButton size="small">
                {showSources ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>

            <Collapse in={showSources}>
              <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 1 }}>
                {message.sources.map((source, idx) => (
                  <Chip
                    key={idx}
                    label={source.documentTitle}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.75rem" }}
                  />
                ))}
              </Box>

              {showSources && (
                <Box sx={{ mt: 2 }}>
                  {message.sources.map((source, idx) => (
                    <Paper
                      key={idx}
                      variant="outlined"
                      sx={{ p: 1.5, mb: 1, backgroundColor: "action.hover" }}
                    >
                      <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.5 }}>
                        {source.documentTitle}
                      </Typography>
                      <Typography variant="caption" sx={{ opacity: 0.8 }}>
                        {source.text.substring(0, 200)}
                        {source.text.length > 200 ? "..." : ""}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              )}
            </Collapse>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          textAlign: "center",
          opacity: 0.6,
        }}
      >
        <SmartToyIcon sx={{ fontSize: 64, mb: 2 }} />
        <Typography variant="h6">Start a conversation</Typography>
        <Typography variant="body2" color="text.secondary">
          Ask questions about your uploaded documents
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </Box>
  );
};

export default MessageList;
