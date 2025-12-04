/**
 * ErrorMessage Component
 * Displays user-friendly error messages with recovery options
 */
import React from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Collapse,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import DescriptionIcon from "@mui/icons-material/Description";

export interface ErrorMessageProps {
  error: string;
  errorType?: string;
  recoverable?: boolean;
  retryable?: boolean;
  onRetry?: () => void;
  onViewLogs?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  errorType = "Error",
  recoverable = true,
  retryable = true,
  onRetry,
  onViewLogs,
  onDismiss,
  showDetails = false,
}) => {
  const [open, setOpen] = React.useState(true);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const handleDismiss = () => {
    setOpen(false);
    if (onDismiss) {
      onDismiss();
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
  };

  const handleViewLogs = () => {
    if (onViewLogs) {
      onViewLogs();
    }
  };

  // Determine severity based on error type and recoverability
  const severity = recoverable ? "warning" : "error";

  // Get user-friendly title
  const getTitle = () => {
    if (!recoverable) {
      return "Critical Error";
    }
    if (errorType.includes("Network") || errorType.includes("Timeout")) {
      return "Connection Issue";
    }
    if (errorType.includes("Process")) {
      return "Service Error";
    }
    return "Error Occurred";
  };

  // Get user-friendly message
  const getUserFriendlyMessage = () => {
    if (error.includes("ECONNREFUSED")) {
      return "Unable to connect to the service. It may not be running.";
    }
    if (error.includes("timeout")) {
      return "The operation took too long to complete. Please try again.";
    }
    if (error.includes("ENOENT")) {
      return "A required file or resource could not be found.";
    }
    if (error.includes("EACCES") || error.includes("EPERM")) {
      return "Permission denied. Please check file permissions.";
    }
    return error;
  };

  return (
    <Collapse in={open}>
      <Alert
        severity={severity}
        action={
          <IconButton
            aria-label="close"
            color="inherit"
            size="small"
            onClick={handleDismiss}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        }
        sx={{ mb: 2 }}
      >
        <AlertTitle>{getTitle()}</AlertTitle>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {getUserFriendlyMessage()}
        </Typography>

        {/* Action buttons */}
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
          {retryable && onRetry && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleRetry}
            >
              Retry
            </Button>
          )}

          {onViewLogs && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<DescriptionIcon />}
              onClick={handleViewLogs}
            >
              View Logs
            </Button>
          )}

          {showDetails && (
            <Button
              size="small"
              variant="text"
              onClick={() => setDetailsOpen(!detailsOpen)}
            >
              {detailsOpen ? "Hide Details" : "Show Details"}
            </Button>
          )}
        </Box>

        {/* Error details */}
        {showDetails && (
          <Collapse in={detailsOpen}>
            <Box
              sx={{
                mt: 2,
                p: 1,
                backgroundColor: "rgba(0, 0, 0, 0.05)",
                borderRadius: 1,
                fontFamily: "monospace",
                fontSize: "0.75rem",
                overflowX: "auto",
              }}
            >
              <Typography variant="caption" component="div">
                <strong>Error Type:</strong> {errorType}
              </Typography>
              <Typography variant="caption" component="div">
                <strong>Message:</strong> {error}
              </Typography>
            </Box>
          </Collapse>
        )}
      </Alert>
    </Collapse>
  );
};

export default ErrorMessage;
