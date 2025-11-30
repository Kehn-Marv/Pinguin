import React, { useState } from "react";
import { IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, CircularProgress } from "@mui/material";
import { BugReport as BugReportIcon } from "@mui/icons-material";

interface DiagnosticCheck {
  status: string;
  ready?: boolean;
  model?: string | null;
  error?: string;
}

interface DiagnosticResults {
  timestamp: string;
  checks: Record<string, DiagnosticCheck>;
  error?: string;
}

const DiagnosticsButton = () => {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResults | null>(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    const results: DiagnosticResults = {
      timestamp: new Date().toISOString(),
      checks: {},
    };

    try {
      // Check Ollama
      const ollamaReady = await window.api.ollama.isReady();
      results.checks.ollama = {
        status: ollamaReady ? "✅ Running" : "❌ Not Running",
        ready: ollamaReady,
      };

      // Check LLM model
      try {
        const selectedLLM = await window.api.model.getSelectedLLM();
        results.checks.llmModel = {
          status: selectedLLM ? `✅ ${selectedLLM}` : "❌ No model selected",
          model: selectedLLM,
        };
      } catch (e) {
        results.checks.llmModel = {
          status: "❌ Error checking model",
          error: String(e),
        };
      }

      // Check embedding model
      try {
        const selectedEmbedding = await window.api.model.getSelectedEmbedding();
        results.checks.embeddingModel = {
          status: selectedEmbedding ? `✅ ${selectedEmbedding}` : "❌ No model selected",
          model: selectedEmbedding,
        };
      } catch (e) {
        results.checks.embeddingModel = {
          status: "❌ Error checking model",
          error: String(e),
        };
      }

    } catch (error) {
      results.error = String(error);
    }

    setDiagnostics(results);
    setLoading(false);
  };

  const handleOpen = () => {
    setOpen(true);
    runDiagnostics();
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <IconButton
        onClick={handleOpen}
        size="small"
        title="Run Diagnostics"
        sx={{
          position: "fixed",
          bottom: 16,
          right: 16,
          backgroundColor: "background.paper",
          boxShadow: 2,
          "&:hover": {
            backgroundColor: "action.hover",
          },
        }}
      >
        <BugReportIcon />
      </IconButton>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>System Diagnostics</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : diagnostics ? (
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                {diagnostics.timestamp}
              </Typography>
              
              {diagnostics.error && (
                <Typography color="error" sx={{ mt: 2 }}>
                  Error: {diagnostics.error}
                </Typography>
              )}

              {diagnostics.checks && (
                <Box sx={{ mt: 2 }}>
                  {Object.entries(diagnostics.checks).map(([key, value]) => (
                    <Box key={key} sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ textTransform: "capitalize" }}>
                        {key.replace(/([A-Z])/g, " $1").trim()}:
                      </Typography>
                      <Typography variant="body2" sx={{ ml: 2 }}>
                        {value.status}
                      </Typography>
                      {value.error && (
                        <Typography variant="caption" color="error" sx={{ ml: 2 }}>
                          {value.error}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              )}

              <Box sx={{ mt: 3, p: 2, backgroundColor: "action.hover", borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Common Issues:
                </Typography>
                <Typography variant="body2" component="div">
                  • If Ollama is not running, restart the app
                  <br />
                  • If no model is selected, go to Settings → Models
                  <br />
                  • Make sure you have downloaded at least one LLM and one embedding model
                </Typography>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={runDiagnostics} disabled={loading}>
            Refresh
          </Button>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DiagnosticsButton;
