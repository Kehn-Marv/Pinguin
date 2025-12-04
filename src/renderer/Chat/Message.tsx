import React, { useState, memo, useEffect } from "react";
import { Box, Avatar, useTheme, IconButton, Chip } from "@mui/material";
import { ContentCopy, Done, Person, AttachFile } from "@mui/icons-material";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Logo from "../../assets/logo.svg";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import RefrencedTexts from "./RefrencedTexts";
import { FileUploadState } from "../preload/fileUpload";

const Message = memo(({ message, isFirstMentionOfDocuments }: { 
  message: Message; 
  isFirstMentionOfDocuments?: boolean;
}) => {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<FileUploadState[]>([]);

  // Load file upload states for attached documents
  // Only load if this is the first mention of these documents
  useEffect(() => {
    const loadAttachedFiles = async () => {
      if (isFirstMentionOfDocuments && message.documentIds && message.documentIds.length > 0) {
        const fileStates: FileUploadState[] = [];
        for (const docId of message.documentIds) {
          // Try to get upload state by document ID
          const result = await window.api.fileUpload.getUploadState(docId);
          if (result.success && result.uploadState) {
            fileStates.push(result.uploadState);
          } else {
            // Fallback: Create a minimal file state from document info
            try {
              const doc = await window.api.document.get(docId);
              if (doc) {
                fileStates.push({
                  fileId: docId,
                  documentId: docId,
                  chatId: doc.chatId,
                  courseId: doc.courseId,
                  filename: doc.title,
                  filePath: doc.path,
                  fileType: doc.docType,
                  fileSize: 0,
                  status: "complete",
                  progress: 100,
                  startedAt: new Date(),
                  completedAt: new Date(),
                });
              }
            } catch (error) {
              console.error(`Failed to load document ${docId}:`, error);
            }
          }
        }
        setAttachedFiles(fileStates);
      }
    };
    loadAttachedFiles();
  }, [message.documentIds, isFirstMentionOfDocuments]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy text:", error);
      // Fallback for older browsers or when clipboard API is not available
      const textArea = document.createElement("textarea");
      textArea.value = message.content;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (err) {
        console.error("Fallback copy failed:", err);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <Box
      sx={{
        marginTop: 3,
        marginBottom: 3,
        display: "flex",
        flexDirection: "row",
        width: "100%",
      }}
    >
      <Box width={"10%"} marginTop={2}>
        {message.sender === "human" ? (
          <Avatar
            sx={{
              width: 24,
              height: 24,
              backgroundColor: theme.palette.primary.light,
            }}
          >
            <Person sx={{ fontSize: 20 }} />
          </Avatar>
        ) : (
          <img src={Logo} alt="Ollama Logo" width={24} />
        )}
      </Box>
      <Box 
        width={"80%"}
        sx={{
          wordWrap: "break-word",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          maxWidth: "100%",
        }}
      >
        {/* Show attached documents only on first mention */}
        {message.sender === "human" && isFirstMentionOfDocuments && attachedFiles.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 0.75,
              mb: 1.5,
            }}
          >
            {attachedFiles.map((file) => (
              <Chip
                key={file.fileId}
                icon={<AttachFile sx={{ fontSize: 14 }} />}
                label={file.filename}
                size="small"
                variant="outlined"
                sx={{
                  maxWidth: 200,
                  backgroundColor: theme.palette.background.paper,
                  borderColor: theme.palette.divider,
                  "& .MuiChip-label": {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                }}
              />
            ))}
          </Box>
        )}
        <Box
          sx={{
            wordWrap: "break-word",
            overflowWrap: "break-word",
            maxWidth: "100%",
            lineHeight: 1.7,
            fontSize: "15px",
            // Paragraphs
            "& p": {
              margin: "1em 0",
              lineHeight: 1.7,
              wordWrap: "break-word",
              overflowWrap: "break-word",
              "&:first-of-type": {
                marginTop: 0,
              },
              "&:last-of-type": {
                marginBottom: 0,
              },
            },
            // Headings
            "& h1": {
              fontSize: "1.8em",
              fontWeight: 600,
              marginTop: "1.2em",
              marginBottom: "0.6em",
              lineHeight: 1.3,
            },
            "& h2": {
              fontSize: "1.5em",
              fontWeight: 600,
              marginTop: "1.2em",
              marginBottom: "0.6em",
              lineHeight: 1.3,
            },
            "& h3": {
              fontSize: "1.3em",
              fontWeight: 600,
              marginTop: "1em",
              marginBottom: "0.5em",
              lineHeight: 1.3,
            },
            "& h4, & h5, & h6": {
              fontSize: "1.1em",
              fontWeight: 600,
              marginTop: "1em",
              marginBottom: "0.5em",
              lineHeight: 1.3,
            },
            // Lists
            "& ul, & ol": {
              marginTop: "0.8em",
              marginBottom: "0.8em",
              paddingLeft: "2em",
              lineHeight: 1.7,
            },
            "& li": {
              marginTop: "0.4em",
              marginBottom: "0.4em",
            },
            "& li > p": {
              margin: "0.4em 0",
            },
            // Blockquotes
            "& blockquote": {
              borderLeft: "4px solid",
              borderColor: theme.palette.divider,
              paddingLeft: "1em",
              marginLeft: 0,
              marginTop: "1em",
              marginBottom: "1em",
              fontStyle: "italic",
              color: theme.palette.text.secondary,
            },
            // Horizontal rules
            "& hr": {
              border: "none",
              borderTop: "1px solid",
              borderColor: theme.palette.divider,
              marginTop: "1.5em",
              marginBottom: "1.5em",
            },
            // Links
            "& a": {
              color: theme.palette.primary.main,
              textDecoration: "none",
              "&:hover": {
                textDecoration: "underline",
              },
            },
            // Strong/Bold
            "& strong": {
              fontWeight: 600,
            },
            // Emphasis/Italic
            "& em": {
              fontStyle: "italic",
            },
            // Code blocks
            "& pre": {
              maxWidth: "100%",
              overflowX: "auto",
              marginTop: "1em",
              marginBottom: "1em",
            },
            // Tables
            "& table": {
              borderCollapse: "collapse",
              width: "100%",
              marginTop: "1em",
              marginBottom: "1em",
            },
            "& th, & td": {
              border: "1px solid",
              borderColor: theme.palette.divider,
              padding: "8px 12px",
              textAlign: "left",
            },
            "& th": {
              backgroundColor: theme.palette.action.hover,
              fontWeight: 600,
            },
          }}
        >
          <Markdown
            components={{
            code({ inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || "");
              const codeString = String(children).replace(/\n$/, "");
              
              return !inline && match ? (
                <Box sx={{ position: "relative", my: 2 }}>
                  <Box
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      zIndex: 1,
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => {
                        navigator.clipboard.writeText(codeString);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      sx={{
                        backgroundColor: "rgba(255, 255, 255, 0.1)",
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 0.2)",
                        },
                      }}
                    >
                      {copied ? (
                        <Done sx={{ fontSize: 16 }} />
                      ) : (
                        <ContentCopy sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Box>
                  <SyntaxHighlighter
                    style={theme.palette.mode === "dark" ? vscDarkPlus : vs}
                    language={match[1]}
                    PreTag="div"
                    wrapLines={true}
                    wrapLongLines={true}
                    customStyle={{
                      margin: 0,
                      borderRadius: "8px",
                      fontSize: "0.9em",
                      padding: "16px",
                      paddingRight: "50px", // Extra padding on right for copy button
                      maxWidth: "100%",
                      overflowX: "auto",
                    } as any}
                    {...props}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </Box>
              ) : (
                <code
                  className={className}
                  style={{
                    backgroundColor: theme.palette.mode === "dark" 
                      ? "rgba(255, 255, 255, 0.1)" 
                      : "rgba(0, 0, 0, 0.05)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "0.9em",
                    fontFamily: "monospace",
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            },
          }}
        >
            {message.content}
          </Markdown>
        </Box>
        {message.citations && message.citations.length > 0 && (
          <RefrencedTexts citations={message.citations} />
        )}
      </Box>
      <Box width={"10%"}>
        <IconButton onClick={copyToClipboard}>
          {copied ? <Done /> : <ContentCopy />}
        </IconButton>
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if message content, sender, citations, or documentIds change
  return (
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.sender === nextProps.message.sender &&
    JSON.stringify(prevProps.message.citations) === JSON.stringify(nextProps.message.citations) &&
    JSON.stringify(prevProps.message.documentIds) === JSON.stringify(nextProps.message.documentIds)
  );
});

Message.displayName = 'Message';

export default Message;
