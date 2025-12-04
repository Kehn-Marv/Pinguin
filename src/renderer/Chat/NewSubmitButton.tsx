import React, { useState, useEffect } from "react";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import {
  Add as AddIcon,
  ArrowUpward as ArrowUpwardIcon,
  AttachFile as AttachFileIcon,
  Code as CodeIcon,
  Lightbulb as LightbulbIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty,
} from "@mui/icons-material";
import useIsLoadingMessage from "../backend/useIsLoadingMessage";
import useCourses from "../backend/useCourses";
import { useNotification } from "../context/NotificationContext";
import { FileUploadState } from "../preload/fileUpload";

type ModeType = "files" | "coding" | "thinking" | null;

const NewSubmitButton = () => {
  const { courseId, chatId } = useParams<{ courseId: string; chatId: string }>();
  const navigate = useNavigate();
  const [question, setQuestion] = useState<string>("");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMode, setSelectedMode] = useState<ModeType>(null);
  const [attachedFiles, setAttachedFiles] = useState<FileUploadState[]>([]);
  const loading = useIsLoadingMessage({ courseId: courseId || "", chatId: chatId || "" });
  const courses = useCourses();
  const { showNotification } = useNotification();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as user types - ChatGPT style
  const adjustTextareaHeight = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset to auto to recalculate
      textarea.style.height = 'auto';
      
      // Get the scroll height and constrain it
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 200);
      textarea.style.height = `${newHeight}px`;
      
      // Keep padding consistent - don't change it
      // Buttons will handle alignment with their own margin
    }
  }, []);

  // Adjust height when question changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [question, adjustTextareaHeight]);

  // On mount, check if there are pending files from navigation
  useEffect(() => {
    const pendingFilesKey = `pendingFiles_${chatId}`;
    const pendingFiles = sessionStorage.getItem(pendingFilesKey);
    
    if (pendingFiles && chatId) {
      try {
        const files = JSON.parse(pendingFiles);
        setAttachedFiles(files);
        // Clear from storage after loading
        sessionStorage.removeItem(pendingFilesKey);
      } catch (error) {
        console.error("Error loading pending files:", error);
      }
    }
    
    // Also restore pending text input
    const pendingTextKey = `pendingText_${chatId}`;
    const pendingText = sessionStorage.getItem(pendingTextKey);
    if (pendingText) {
      setQuestion(pendingText);
      sessionStorage.removeItem(pendingTextKey);
    }
  }, [chatId]);

  // Persist attached files when navigating away (instead of clearing them)
  const prevChatIdRef = React.useRef<string | undefined>(chatId);
  useEffect(() => {
    // When chat changes, save current files to sessionStorage for the OLD chat
    if (prevChatIdRef.current !== undefined && prevChatIdRef.current !== chatId) {
      const oldChatId = prevChatIdRef.current;
      
      // Save files from the old chat if there are any
      if (attachedFiles.length > 0) {
        const pendingFilesKey = `pendingFiles_${oldChatId}`;
        sessionStorage.setItem(pendingFilesKey, JSON.stringify(attachedFiles));
      }
      
      // Save text input from the old chat if there is any
      if (question.trim()) {
        const pendingTextKey = `pendingText_${oldChatId}`;
        sessionStorage.setItem(pendingTextKey, question);
      }
      
      // Check if the NEW chat has pending files
      const newPendingFilesKey = `pendingFiles_${chatId}`;
      const newPendingFiles = sessionStorage.getItem(newPendingFilesKey);
      
      if (newPendingFiles) {
        // Files will be loaded by the other useEffect
        try {
          const files = JSON.parse(newPendingFiles);
          setAttachedFiles(files);
          sessionStorage.removeItem(newPendingFilesKey);
        } catch (error) {
          console.error("Error loading pending files:", error);
          setAttachedFiles([]);
        }
      } else {
        // Clear files for the new chat
        setAttachedFiles([]);
      }
      
      // Check if the NEW chat has pending text
      const newPendingTextKey = `pendingText_${chatId}`;
      const newPendingText = sessionStorage.getItem(newPendingTextKey);
      
      if (newPendingText) {
        setQuestion(newPendingText);
        sessionStorage.removeItem(newPendingTextKey);
      } else {
        // Clear text for the new chat
        setQuestion("");
      }
    }
    prevChatIdRef.current = chatId;
  }, [chatId]);

  // Subscribe to upload state changes for all attached files
  useEffect(() => {
    const unsubscribeFunctions: (() => void)[] = [];

    attachedFiles.forEach((file) => {
      // Subscribe to state updates
      const unsubscribe = window.api.fileUpload.subscribeToUploadState(
        file.fileId,
        (updatedState) => {
          console.log(`[FileUpload] State update for ${file.filename}:`, {
            status: updatedState.status,
            progress: updatedState.progress,
            documentId: updatedState.documentId,
            hasDocumentId: !!updatedState.documentId
          });
          setAttachedFiles((prev) =>
            prev.map((f) => (f.fileId === updatedState.fileId ? updatedState : f))
          );
        }
      );
      unsubscribeFunctions.push(unsubscribe);

      // Subscribe to cancellation events
      const unsubscribeCancelled = window.api.fileUpload.subscribeToUploadCancelled(
        file.fileId,
        () => {
          setAttachedFiles((prev) => prev.filter((f) => f.fileId !== file.fileId));
        }
      );
      unsubscribeFunctions.push(unsubscribeCancelled);
    });

    // Cleanup subscriptions when component unmounts or attachedFiles changes
    return () => {
      unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
    };
  }, [attachedFiles.map((f) => f.fileId).join(",")]);

  // Track if we're in the middle of submitting to prevent saving cleared state
  const isSubmittingRef = React.useRef(false);

  // Cleanup: Save state when component unmounts (e.g., navigating to settings)
  useEffect(() => {
    return () => {
      // Don't save if we just submitted (state was intentionally cleared)
      if (isSubmittingRef.current) {
        return;
      }
      
      // Only save if we have a valid chatId and there's something to save
      if (chatId) {
        if (attachedFiles.length > 0) {
          const pendingFilesKey = `pendingFiles_${chatId}`;
          sessionStorage.setItem(pendingFilesKey, JSON.stringify(attachedFiles));
        }
        if (question.trim()) {
          const pendingTextKey = `pendingText_${chatId}`;
          sessionStorage.setItem(pendingTextKey, question);
        }
      }
    };
  }, [chatId, attachedFiles, question]);


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Mark that we're submitting to prevent saving cleared state
    isSubmittingRef.current = true;
    
    // Convert mode type
    const mode = selectedMode === "thinking" || selectedMode === "coding" ? selectedMode : undefined;
    
    // Generate default query if files are attached but no question is provided
    let messageToSend = question.trim();
    if (!messageToSend && attachedFiles.length > 0) {
      messageToSend = "What can you tell me about this file?";
    }
    
    if (messageToSend || attachedFiles.length > 0) {
      try {
        // VALIDATION: Check if all documents are processed
        const processingFiles = attachedFiles.filter(
          (file) => file.status === "uploading" || file.status === "processing"
        );
        
        if (processingFiles.length > 0) {
          showNotification(
            "Please wait for documents to finish processing",
            "warning"
          );
          return;
        }
        
        // Check for failed uploads
        const failedFiles = attachedFiles.filter(
          (file) => file.status === "error"
        );
        
        if (failedFiles.length > 0) {
          showNotification(
            "Some documents failed to upload. Please remove or retry them.",
            "error"
          );
          return;
        }
        
        // Extract document IDs from completed uploads
        const documentIds = attachedFiles
          .filter((file) => file.status === "complete" && file.documentId)
          .map((file) => file.documentId!);
        
        console.log("=== DOCUMENT SUBMISSION DEBUG ===");
        console.log("Attached files:", JSON.stringify(attachedFiles, null, 2));
        console.log("Document IDs to send:", documentIds);
        console.log("Complete files:", attachedFiles.filter(f => f.status === "complete"));
        console.log("Files with documentId:", attachedFiles.filter(f => f.documentId));
        console.log("================================");
        
        // If we have attached files but no document IDs, something went wrong
        if (attachedFiles.some(f => f.status === "complete") && documentIds.length === 0) {
          console.error("Complete files found but no document IDs!");
          console.error("File details:", attachedFiles.map(f => ({
            filename: f.filename,
            status: f.status,
            documentId: f.documentId,
            fileId: f.fileId
          })));
          showNotification(
            "Document processing incomplete. Please try re-uploading the file.",
            "error"
          );
          return;
        }
        
        console.log("[NewSubmitButton] Submitting with mode:", mode);
        
        // Auto-chat creation: If no chat is selected, create a new one seamlessly
        if (!courseId || !chatId) {
          // Get the first course, or create a default one if none exists
          // (courses are used internally for organization, but users don't interact with them)
          let currentCourse = courses.length > 0 ? courses[0] : null;
          
          if (!currentCourse) {
            // Silently create a default course for internal use
            currentCourse = await window.api.course.add("Default");
          }
          
          // Create a new chat with auto-generated title
          // The title will be generated from the first message in sendMessage
          const chat = await window.api.chat.addChat(currentCourse.id);
          
          // Clear input and files BEFORE navigation to prevent restoration
          setQuestion("");
          setSelectedMode(null);
          setAttachedFiles([]);
          
          // Reset textarea height
          if (textareaRef.current) {
            textareaRef.current.style.height = '24px';
          }
          
          // Clear any pending state for the new chat to prevent restoration
          sessionStorage.removeItem(`pendingFiles_${chat.id}`);
          sessionStorage.removeItem(`pendingText_${chat.id}`);
          
          // Navigate to the new chat
          // This ensures the user sees the chat interface immediately
          navigate(`/chat/${currentCourse.id}/${chat.id}`);
          
          // Longer delay to ensure navigation completes, Chat component mounts, AND subscriptions are ready
          // This prevents the race condition where messages are sent before the component is listening
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Store mode for this specific chat BEFORE sending
          if (mode) {
            sessionStorage.setItem(`chatMode_${chat.id}`, mode);
          }
          
          // Send message AFTER navigation and subscription setup
          // The Chat component is now mounted and subscribed to message events
          console.log(`[NewSubmitButton] Sending message to new chat ${chat.id} with mode:`, mode);
          window.api.message.sendMessage(
            currentCourse.id,
            chat.id,
            messageToSend,
            mode,
            documentIds.length > 0 ? documentIds : undefined
          );
          
          // Reset submit flag after a delay
          setTimeout(() => {
            isSubmittingRef.current = false;
          }, 500);
        } else {
          // Clear input and files immediately for better UX
          setQuestion("");
          setSelectedMode(null);
          setAttachedFiles([]);
          
          // Reset textarea height
          if (textareaRef.current) {
            textareaRef.current.style.height = '24px';
          }
          
          // Store mode for this specific chat BEFORE sending
          if (mode) {
            sessionStorage.setItem(`chatMode_${chatId}`, mode);
          }
          
          // Chat already exists, just send the message WITH document IDs
          console.log(`[NewSubmitButton] Sending message to chat ${chatId} with mode:`, mode);
          window.api.message.sendMessage(
            courseId,
            chatId,
            messageToSend,
            mode,
            documentIds.length > 0 ? documentIds : undefined
          );
          
          // Reset submit flag after a delay
          setTimeout(() => {
            isSubmittingRef.current = false;
          }, 500);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        showNotification(
          `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
          "error"
        );
      }
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleAddPhotosFiles = async () => {
    handleMenuClose();
    
    try {
      // Check if already at file limit
      const MAX_FILES = 3;
      if (attachedFiles.length >= MAX_FILES) {
        showNotification(
          `Maximum ${MAX_FILES} files allowed per message`,
          "warning"
        );
        return;
      }
      
      // Open file picker dialog FIRST (before creating chat)
      const result = await window.api.fileUpload.selectFiles();
      
      if (!result.success || !result.filePaths || result.filePaths.length === 0) {
        return;
      }
      
      // Calculate how many files can still be added
      const remainingSlots = MAX_FILES - attachedFiles.length;
      const filesToUpload = result.filePaths.slice(0, remainingSlots);
      
      // Warn if some files were excluded
      if (result.filePaths.length > remainingSlots) {
        showNotification(
          `Only ${remainingSlots} file${remainingSlots !== 1 ? 's' : ''} can be added (limit: ${MAX_FILES} per message)`,
          "warning"
        );
      }
      
      // Get or create course and chat IDs
      let currentCourseId: string;
      let currentChatId: string;
      let shouldNavigate = false;
      
      if (!courseId || !chatId) {
        // Get or create a default course
        let currentCourse = courses.length > 0 ? courses[0] : null;
        
        if (!currentCourse) {
          currentCourse = await window.api.course.add("Default");
        }
        
        currentCourseId = currentCourse.id;
        
        // Create a new chat
        const chat = await window.api.chat.addChat(currentCourseId);
        currentChatId = chat.id;
        shouldNavigate = true;
      } else {
        currentCourseId = courseId;
        currentChatId = chatId;
      }
      
      // Upload each selected file BEFORE navigating
      const uploadedStates: FileUploadState[] = [];
      for (const filePath of filesToUpload) {
        const uploadResult = await window.api.fileUpload.upload(
          currentCourseId,
          currentChatId,
          filePath
        );
        
        if (uploadResult.success && uploadResult.uploadState) {
          uploadedStates.push(uploadResult.uploadState);
        } else {
          showNotification(
            `Failed to upload file: ${uploadResult.error || "Unknown error"}`,
            "error"
          );
        }
      }
      
      // If navigating to a new chat, store files AND text in sessionStorage
      if (shouldNavigate && uploadedStates.length > 0) {
        const allFiles = [...attachedFiles, ...uploadedStates];
        const pendingFilesKey = `pendingFiles_${currentChatId}`;
        sessionStorage.setItem(pendingFilesKey, JSON.stringify(allFiles));
        
        // Also save the current text input so it persists after navigation
        if (question.trim()) {
          const pendingTextKey = `pendingText_${currentChatId}`;
          sessionStorage.setItem(pendingTextKey, question);
        }
        
        // Navigate immediately - files and text will be restored by useEffect
        navigate(`/chat/${currentCourseId}/${currentChatId}`);
      } else {
        // Not navigating, just update state normally
        if (uploadedStates.length > 0) {
          setAttachedFiles((prev) => [...prev, ...uploadedStates]);
        }
      }
    } catch (error) {
      console.error("File upload error:", error);
      showNotification("Failed to upload file. Please try again.", "error");
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    try {
      await window.api.fileUpload.cancelUpload(fileId);
      setAttachedFiles((prev) => prev.filter((file) => file.fileId !== fileId));
    } catch (error) {
      console.error("Error removing file:", error);
      showNotification("Failed to remove file.", "error");
    }
  };



  const handleCoding = () => {
    setSelectedMode("coding");
    handleMenuClose();
  };

  const handleThinking = () => {
    setSelectedMode("thinking");
    handleMenuClose();
  };

  const getModeConfig = () => {
    switch (selectedMode) {
      case "files":
        return { icon: <AttachFileIcon fontSize="small" />, label: "Add photos & files" };
      case "coding":
        return { icon: <CodeIcon fontSize="small" />, label: "Coding" };
      case "thinking":
        return { icon: <LightbulbIcon fontSize="small" />, label: "Think" };
      default:
        return null;
    }
  };

  const modeConfig = getModeConfig();

  const getFileStatusIcon = (status: string) => {
    switch (status) {
      case "complete":
        return <CheckCircleIcon sx={{ fontSize: 14 }} />;
      case "error":
        return <ErrorIcon sx={{ fontSize: 14 }} />;
      case "processing":
      case "uploading":
        return <HourglassEmpty sx={{ fontSize: 14 }} />;
      default:
        return <AttachFileIcon sx={{ fontSize: 14 }} />;
    }
  };

  const getFileStatusColor = (
    status: string
  ): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    switch (status) {
      case "complete":
        return "success";
      case "error":
        return "error";
      case "processing":
      case "uploading":
        return "primary";
      default:
        return "default";
    }
  };

  return (
    <Box sx={{ width: "100%", position: "relative" }}>
      <form onSubmit={handleSubmit}>
        <Box
          sx={{
            borderRadius: 3,
            backgroundColor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            transition: "border-color 0.2s ease",
            "&:hover": {
              borderColor: "text.secondary",
            },
            "&:focus-within": {
              borderColor: "primary.main",
              borderWidth: 1,
            },
            p: 0.5,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
          }}
        >
          {/* Document chips inside input */}
          {attachedFiles.length > 0 && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 0.75,
                pb: 0.5,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              {attachedFiles.map((file) => (
                <Chip
                  key={file.fileId}
                  icon={getFileStatusIcon(file.status)}
                  label={file.filename}
                  onDelete={() => handleRemoveFile(file.fileId)}
                  size="small"
                  color={getFileStatusColor(file.status)}
                  variant={file.status === "complete" ? "filled" : "outlined"}
                  sx={{
                    maxWidth: 200,
                    "& .MuiChip-label": {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    },
                    animation: file.status === "processing" || file.status === "uploading" 
                      ? "pulse 2s ease-in-out infinite" 
                      : "none",
                    "@keyframes pulse": {
                      "0%, 100%": { opacity: 1 },
                      "50%": { opacity: 0.6 },
                    },
                  }}
                />
              ))}
            </Box>
          )}

          {/* Mode chip inside input */}
          {modeConfig && (
            <Box sx={{ display: "flex", alignItems: "center", pb: 0.5 }}>
              <Chip
                icon={modeConfig.icon}
                label={modeConfig.label}
                onDelete={() => {
                  setSelectedMode(null);
                }}
                size="small"
                sx={{
                  backgroundColor: "primary.main",
                  color: "primary.contrastText",
                  "& .MuiChip-icon": {
                    color: "primary.contrastText",
                  },
                  "& .MuiChip-deleteIcon": {
                    color: "primary.contrastText",
                    "&:hover": {
                      color: "primary.contrastText",
                      opacity: 0.8,
                    },
                  },
                }}
              />
            </Box>
          )}

          {/* Text input area - ChatGPT style with proper padding */}
          <Box sx={{ 
            display: "flex", 
            alignItems: "center",
            gap: 1,
            py: 0, // No vertical padding for minimal height
          }}>
            <IconButton
              onClick={handleMenuOpen}
              size="small"
              sx={{
                width: 32,
                height: 32,
                flexShrink: 0,
                alignSelf: "flex-end",
                mb: "19.5px", // Fine-tuned to perfectly center-align with text
                transition: "all 0.2s ease",
                "&:hover": {
                  backgroundColor: "action.hover",
                  transform: "scale(1.05)",
                },
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>

            <Box
              component="textarea"
              ref={textareaRef}
              value={question}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setQuestion(e.target.value);
                // Height will auto-adjust via useEffect
              }}
              disabled={loading}
              placeholder={
                attachedFiles.filter((f) => f.status === "complete").length > 0
                  ? `Ask about your ${attachedFiles.filter((f) => f.status === "complete").length} document${
                      attachedFiles.filter((f) => f.status === "complete").length !== 1 ? "s" : ""
                    }...`
                  : "Ask anything"
              }
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                // Submit on Enter, new line on Shift+Enter
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if ((question.trim() || attachedFiles.length > 0) && !loading) {
                    // Create a synthetic form event for handleSubmit
                    const syntheticEvent = {
                      preventDefault: () => {
                        // No-op for synthetic event
                      },
                    } as React.FormEvent<HTMLFormElement>;
                    handleSubmit(syntheticEvent);
                  }
                }
              }}
              sx={{
                flex: 1,
                border: "none",
                outline: "none",
                resize: "none",
                fontFamily: "inherit",
                fontSize: "1rem",
                lineHeight: "24px",
                minHeight: "24px",
                maxHeight: "200px",
                height: "24px",
                overflow: "hidden",
                overflowY: "auto",
                backgroundColor: "transparent",
                color: "text.primary",
                padding: "22px 0 0 0",
                margin: 0,
                verticalAlign: "middle",
                "&::placeholder": {
                  color: "text.secondary",
                  opacity: 0.7,
                },
                "&::-webkit-scrollbar": {
                  width: "6px",
                },
                "&::-webkit-scrollbar-track": {
                  backgroundColor: "transparent",
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "rgba(0, 0, 0, 0.2)",
                  borderRadius: "3px",
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                  },
                },
              }}
            />

            <IconButton
              disabled={loading || (question.trim() === "" && attachedFiles.length === 0)}
              type="submit"
              size="small"
              sx={{
                backgroundColor: (question.trim() || attachedFiles.length > 0) ? "primary.main" : "action.disabledBackground",
                color: (question.trim() || attachedFiles.length > 0) ? "primary.contrastText" : "action.disabled",
                borderRadius: "50%",
                width: 32,
                height: 32,
                flexShrink: 0,
                alignSelf: "flex-end",
                mb: "19.5px", // Fine-tuned to perfectly center-align with text
                transition: "all 0.2s ease",
                "&:hover": {
                  backgroundColor: (question.trim() || attachedFiles.length > 0) ? "primary.dark" : "action.disabledBackground",
                  transform: (question.trim() || attachedFiles.length > 0) ? "scale(1.05)" : "none",
                },
                "&:disabled": {
                  backgroundColor: "action.disabledBackground",
                  color: "action.disabled",
                },
              }}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </form>

      {/* Action menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        PaperProps={{
          sx: {
            borderRadius: 2,
            minWidth: 220,
            mt: -1,
            boxShadow: "0px 4px 20px rgba(0, 0, 0, 0.1)",
          },
        }}
      >
        <MenuItem
          onClick={handleAddPhotosFiles}
          selected={selectedMode === "files"}
          sx={{
            py: 1.5,
            transition: "all 0.2s ease",
            "&:hover": {
              backgroundColor: "action.hover",
              transform: "translateX(4px)",
            },
            "&.Mui-selected": {
              backgroundColor: "action.selected",
              "&:hover": {
                backgroundColor: "action.selected",
              },
            },
          }}
        >
          <ListItemIcon>
            <AttachFileIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add photos & files</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={handleCoding}
          selected={selectedMode === "coding"}
          sx={{
            py: 1.5,
            transition: "all 0.2s ease",
            "&:hover": {
              backgroundColor: "action.hover",
              transform: "translateX(4px)",
            },
            "&.Mui-selected": {
              backgroundColor: "action.selected",
              "&:hover": {
                backgroundColor: "action.selected",
              },
            },
          }}
        >
          <ListItemIcon>
            <CodeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Coding</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={handleThinking}
          selected={selectedMode === "thinking"}
          sx={{
            py: 1.5,
            transition: "all 0.2s ease",
            "&:hover": {
              backgroundColor: "action.hover",
              transform: "translateX(4px)",
            },
            "&.Mui-selected": {
              backgroundColor: "action.selected",
              "&:hover": {
                backgroundColor: "action.selected",
              },
            },
          }}
        >
          <ListItemIcon>
            <LightbulbIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Thinking</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default NewSubmitButton;
