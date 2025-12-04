/**
 * ProcessStatus Component
 * Displays process health and provides manual restart options
 */
import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Alert,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";

interface ProcessStatusData {
  name: string;
  running: boolean;
  restartAttempts: number;
  lastRestartTime?: string;
  lastError?: string;
}

interface ProcessStatusProps {
  processName: string;
  displayName?: string;
}

const ProcessStatus: React.FC<ProcessStatusProps> = ({
  processName,
  displayName,
}) => {
  const [status, setStatus] = useState<ProcessStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxAttemptsExceeded, setMaxAttemptsExceeded] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const result = await window.api.error.getProcessStatus(processName);
      if (result.success) {
        setStatus(result.status);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch process status";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    try {
      setRestarting(true);
      setError(null);
      const result = await window.api.error.restartProcess(processName);
      if (result.success) {
        setMaxAttemptsExceeded(false);
        // Wait a bit then refresh status
        setTimeout(fetchStatus, 2000);
      } else {
        setError(result.error);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to restart process";
      setError(errorMessage);
    } finally {
      setRestarting(false);
    }
  };

  const handleResetAttempts = async () => {
    try {
      const result = await window.api.error.resetRestartAttempts(processName);
      if (result.success) {
        setMaxAttemptsExceeded(false);
        fetchStatus();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reset attempts";
      setError(errorMessage);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Set up polling
    const interval = setInterval(fetchStatus, 10000); // Poll every 10 seconds

    // Listen for max attempts exceeded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribe = window.api.error.onMaxAttemptsExceeded((data: any) => {
      if (data.processName === processName) {
        setMaxAttemptsExceeded(true);
        setError(data.reason);
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [processName]);

  if (loading && !status) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} />
            <Typography>Loading process status...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = () => {
    if (!status) return <ErrorIcon color="error" />;
    if (status.running) return <CheckCircleIcon color="success" />;
    if (status.restartAttempts > 0) return <WarningIcon color="warning" />;
    return <ErrorIcon color="error" />;
  };

  const getStatusColor = (): "error" | "success" | "warning" => {
    if (!status) return "error";
    if (status.running) return "success";
    if (status.restartAttempts > 0) return "warning";
    return "error";
  };

  const getStatusText = () => {
    if (!status) return "Unknown";
    if (status.running) return "Running";
    if (status.restartAttempts > 0) return "Restarting...";
    return "Stopped";
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {getStatusIcon()}
            <Typography variant="h6">
              {displayName || processName}
            </Typography>
          </Box>
          <Chip
            label={getStatusText()}
            color={getStatusColor()}
            size="small"
          />
        </Box>

        {status && status.restartAttempts > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Restart attempts: {status.restartAttempts}
          </Typography>
        )}

        {status && status.lastRestartTime && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Last restart: {new Date(status.lastRestartTime).toLocaleString()}
          </Typography>
        )}

        {maxAttemptsExceeded && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Maximum restart attempts exceeded. Manual intervention required.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={restarting ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={handleRestart}
            disabled={restarting || (status?.running && !maxAttemptsExceeded)}
          >
            {restarting ? "Restarting..." : "Restart"}
          </Button>

          {maxAttemptsExceeded && (
            <Button
              variant="text"
              size="small"
              onClick={handleResetAttempts}
            >
              Reset Attempts
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default ProcessStatus;
