import React, { useEffect, useState } from "react";
import { Box, IconButton, LinearProgress, Typography, useTheme, Button, Tooltip } from "@mui/material";
import { 
  Close as CloseIcon, 
  InsertDriveFile as FileIcon, 
  Image as ImageIcon, 
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as ProcessingIcon
} from "@mui/icons-material";
import { FileUploadState } from "../preload/fileUpload";

interface FilePreviewCardProps {
  uploadState: FileUploadState;
  onRemove: (fileId: string) => void;
  onRetry?: (fileId: string, filePath: string) => void;
}

const FilePreviewCard: React.FC<FilePreviewCardProps> = ({ uploadState, onRemove, onRetry }) => {
  const theme = useTheme();
  const [localUploadState, setLocalUploadState] = useState<FileUploadState>(uploadState);

  // Subscribe to upload state changes
  useEffect(() => {
    const unsubscribe = window.api.fileUpload.subscribeToUploadState(
      uploadState.fileId,
      (newState) => {
        setLocalUploadState(newState);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [uploadState.fileId]);

  // Subscribe to upload cancellation
  useEffect(() => {
    const unsubscribe = window.api.fileUpload.subscribeToUploadCancelled(
      uploadState.fileId,
      () => {
        // File was cancelled, parent component should handle removal
      }
    );

    return () => {
      unsubscribe();
    };
  }, [uploadState.fileId]);

  const isImage = () => {
    const imageTypes = ["png", "jpg", "jpeg", "gif"];
    return imageTypes.includes(localUploadState.fileType.toLowerCase());
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getStatusColor = () => {
    switch (localUploadState.status) {
      case "complete":
        return theme.palette.success.main;
      case "error":
        return theme.palette.error.main;
      case "processing":
      case "uploading":
        return theme.palette.primary.main;
      default:
        return theme.palette.grey[500];
    }
  };

  const getStatusText = () => {
    switch (localUploadState.status) {
      case "complete":
        return "Complete";
      case "error":
        return getUserFriendlyError(localUploadState.error);
      case "processing":
        return "Processing...";
      case "uploading":
        return "Uploading...";
      default:
        return "Pending...";
    }
  };

  const getUserFriendlyError = (error?: string): string => {
    if (!error) return "Upload failed";
    
    // Convert technical errors to user-friendly messages
    if (error.includes("ENOENT") || error.includes("not found")) {
      return "File not found";
    }
    if (error.includes("EACCES") || error.includes("permission")) {
      return "Permission denied";
    }
    if (error.includes("timeout") || error.includes("timed out")) {
      return "Upload timed out";
    }
    if (error.includes("network") || error.includes("ECONNREFUSED")) {
      return "Network error";
    }
    if (error.includes("unsupported") || error.includes("format")) {
      return "Unsupported file format";
    }
    if (error.includes("too large") || error.includes("size")) {
      return "File too large";
    }
    
    // If error is short enough, show it directly
    if (error.length < 50) {
      return error;
    }
    
    // Otherwise, show a generic message
    return "Upload failed";
  };

  const handleRetry = () => {
    if (onRetry && localUploadState.filePath) {
      onRetry(localUploadState.fileId, localUploadState.filePath);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        padding: 1.5,
        borderRadius: 2,
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        transition: "all 0.2s ease",
        position: "relative",
        minWidth: 280,
        maxWidth: 400,
        "&:hover": {
          backgroundColor: theme.palette.action.hover,
          borderColor: theme.palette.text.secondary,
          boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.1)",
        },
      }}
    >
      {/* Thumbnail or Icon */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 1,
          backgroundColor: theme.palette.grey[100],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {isImage() && localUploadState.thumbnailPath ? (
          <img
            src={`file://${localUploadState.thumbnailPath}`}
            alt={localUploadState.filename}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : isImage() ? (
          <ImageIcon sx={{ fontSize: 28, color: theme.palette.grey[500] }} />
        ) : (
          <FileIcon sx={{ fontSize: 28, color: theme.palette.grey[500] }} />
        )}
      </Box>

      {/* File Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: theme.palette.text.primary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {localUploadState.filename}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.text.secondary,
            display: "block",
          }}
        >
          {localUploadState.fileType.toUpperCase()} • {formatFileSize(localUploadState.fileSize)}
        </Typography>

        {/* Progress Bar with status indicator */}
        {(localUploadState.status === "uploading" || localUploadState.status === "processing") && (
          <Box sx={{ mt: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={localUploadState.progress}
              sx={{
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.palette.grey[200],
                "& .MuiLinearProgress-bar": {
                  backgroundColor: getStatusColor(),
                  borderRadius: 2,
                },
              }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
              <ProcessingIcon 
                sx={{ 
                  fontSize: "0.9rem", 
                  color: getStatusColor(),
                  animation: "spin 2s linear infinite",
                  "@keyframes spin": {
                    "0%": { transform: "rotate(0deg)" },
                    "100%": { transform: "rotate(360deg)" },
                  },
                }} 
              />
              <Typography
                variant="caption"
                sx={{
                  color: theme.palette.text.secondary,
                  fontSize: "0.7rem",
                }}
              >
                {localUploadState.progress}% • {getStatusText()}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Status Text for Complete with icon */}
        {localUploadState.status === "complete" && (
          <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
            <CheckCircleIcon 
              sx={{ 
                fontSize: "0.9rem", 
                color: getStatusColor() 
              }} 
            />
            <Typography
              variant="caption"
              sx={{
                color: getStatusColor(),
                fontSize: "0.7rem",
                fontWeight: 500,
              }}
            >
              {getStatusText()}
            </Typography>
          </Box>
        )}

        {/* Status Text for Pending */}
        {localUploadState.status === "pending" && (
          <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
            <ProcessingIcon 
              sx={{ 
                fontSize: "0.9rem", 
                color: getStatusColor() 
              }} 
            />
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.text.secondary,
                fontSize: "0.7rem",
              }}
            >
              {getStatusText()}
            </Typography>
          </Box>
        )}

        {/* Error message with retry button and icon */}
        {localUploadState.status === "error" && (
          <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
            <ErrorIcon 
              sx={{ 
                fontSize: "0.9rem", 
                color: getStatusColor(),
                flexShrink: 0
              }} 
            />
            <Tooltip title={localUploadState.error || "Upload failed"}>
              <Typography
                variant="caption"
                sx={{
                  color: getStatusColor(),
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {getStatusText()}
              </Typography>
            </Tooltip>
            {onRetry && (
              <Button
                size="small"
                startIcon={<RefreshIcon sx={{ fontSize: 14 }} />}
                onClick={handleRetry}
                sx={{
                  minWidth: "auto",
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  color: theme.palette.primary.main,
                  flexShrink: 0,
                  "&:hover": {
                    backgroundColor: theme.palette.primary.light,
                  },
                }}
              >
                Retry
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* Remove Button */}
      <IconButton
        size="small"
        onClick={() => onRemove(localUploadState.fileId)}
        sx={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 24,
          height: 24,
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.divider}`,
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: theme.palette.error.main,
            borderColor: theme.palette.error.main,
            color: theme.palette.error.contrastText,
            transform: "scale(1.1)",
          },
        }}
      >
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
};

export default FilePreviewCard;
