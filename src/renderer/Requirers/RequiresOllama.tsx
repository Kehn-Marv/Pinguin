import React, { useState, useEffect } from "react";
import { Box, Typography, CircularProgress, Button } from "@mui/material";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Logo from "../../assets/logo.svg";

type OllamaStatus = 
  | "checking"
  | "ready"
  | "starting-system"
  | "starting-bundled"
  | "needs-install"
  | "error";

interface OllamaInitResult {
  success: boolean;
  status: OllamaStatus;
  source?: "existing" | "system" | "bundled";
  host?: string;
  error?: string;
}

type PropsType = {
  children: React.ReactNode;
};

const RequiresOllama = ({ children }: PropsType) => {
  const [status, setStatus] = useState<OllamaStatus>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeOllama();
  }, []);

  const initializeOllama = async () => {
    try {
      setError(null);

      const result = await window.api.ollama.initialize() as OllamaInitResult;

      if (result.success) {
        setStatus(result.status);
        
        if (result.status === "ready") {
          console.log(`Ollama ready from source: ${result.source}`);
        }
      } else {
        setStatus("error");
        setError(result.error || "Failed to initialize Ollama");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      console.error("Error initializing Ollama:", err);
      setStatus("error");
      setError(errorMessage);
    }
  };

  const handleRetry = () => {
    initializeOllama();
  };

  const handleOpenOllamaWebsite = () => {
    // For now, just show the URL - we can add proper shell integration later
    console.log("Open: https://ollama.com/download");
  };

  // Show children if Ollama is ready
  if (status === "ready") {
    return <>{children}</>;
  }

  // Show loading states
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100%",
        padding: 4,
      }}
    >
      <img src={Logo} alt="App Logo" width={150} style={{ marginBottom: 30 }} />

      {status === "checking" && (
        <>
          <CircularProgress size={60} sx={{ mb: 3 }} />
          <Typography variant="h5" gutterBottom>
            Checking Ollama...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Looking for Ollama installation
          </Typography>
        </>
      )}

      {status === "starting-system" && (
        <>
          <CircularProgress size={60} sx={{ mb: 3 }} />
          <Typography variant="h5" gutterBottom>
            Starting Ollama...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Using system-installed Ollama
          </Typography>
        </>
      )}

      {status === "starting-bundled" && (
        <>
          <CircularProgress size={60} sx={{ mb: 3 }} />
          <Typography variant="h5" gutterBottom>
            Starting Ollama...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Using bundled Ollama
          </Typography>
        </>
      )}

      {status === "needs-install" && (
        <>
          <Typography variant="h5" gutterBottom color="warning.main">
            Ollama Not Found
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, textAlign: "center", maxWidth: 500 }}>
            Ollama is required to run this application. Please install Ollama and restart the app.
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleOpenOllamaWebsite}
            >
              Download Ollama
            </Button>
            <Button
              variant="outlined"
              onClick={handleRetry}
            >
              Retry
            </Button>
          </Box>
          <Typography variant="caption" sx={{ mt: 3, color: "text.secondary" }}>
            After installing Ollama, click Retry or restart the application
          </Typography>
        </>
      )}

      {status === "error" && (
        <>
          <Typography variant="h5" gutterBottom color="error">
            Initialization Error
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, textAlign: "center", maxWidth: 500 }}>
            {error || "An error occurred while initializing Ollama"}
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleRetry}
            >
              Retry
            </Button>
            <Button
              variant="outlined"
              onClick={handleOpenOllamaWebsite}
            >
              Get Help
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

const requiresOllama = <P extends object>(Component: React.ComponentType<P>) => {
  return (props: P) => (
    <RequiresOllama>
      <Component {...props} />
    </RequiresOllama>
  );
};

export default requiresOllama;
export { RequiresOllama };
