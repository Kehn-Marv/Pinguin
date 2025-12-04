import React, { useContext, useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Switch,
  FormControlLabel,
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { ThemeContext } from "../../ThemeProvider";
import { useApp } from "../../context/AppContext";
import { useModels } from "../../hooks/useModels";
import useScrollbarStyle from "../../UI/useScrollbarStyle";

const SettingsPanel: React.FC = () => {
  const scrollbarStyle = useScrollbarStyle();
  const { isDark, toggleTheme } = useContext(ThemeContext);
  const { activeLLM, activeEmbeddingModel, setActiveLLM, setActiveEmbeddingModel } = useApp();
  const { models, isLoading, error, downloadProgress, downloadModel, deleteModel, abortDownload } = useModels();
  
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [modelTypeFilter, setModelTypeFilter] = useState<"llm" | "embedding">("llm");
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    // Load app version
    const loadVersion = async () => {
      try {
        // Placeholder - need actual version API
        setAppVersion("1.0.0"); // Default version
      } catch (err) {
        console.error("Failed to load version:", err);
      }
    };
    loadVersion();
  }, []);

  const llmModels = models.filter((m) => m.description.type === "llm");
  const embeddingModels = models.filter((m) => m.description.type === "embedding");
  const downloadedLLMs = llmModels.filter((m) => m.status === "downloaded");
  const downloadedEmbeddings = embeddingModels.filter((m) => m.status === "downloaded");

  const handleLLMChange = async (modelId: string) => {
    await setActiveLLM(modelId);
  };

  const handleEmbeddingChange = async (modelId: string) => {
    await setActiveEmbeddingModel(modelId);
  };

  const handleDownloadClick = (modelId: string) => {
    downloadModel(modelId);
  };

  const handleDeleteClick = async (modelId: string) => {
    if (confirm(`Are you sure you want to delete ${modelId}?`)) {
      await deleteModel(modelId);
    }
  };

  const getModelProgress = (modelId: string) => {
    return downloadProgress.get(modelId);
  };

  const filteredModelsForDownload = modelTypeFilter === "llm" ? llmModels : embeddingModels;

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "900px",
        margin: "0 auto",
        p: 3,
      }}
    >
      <Typography variant="h5" fontWeight="bold" sx={{ mb: 3 }}>
        Settings
      </Typography>

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          ...scrollbarStyle,
        }}
      >
        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Theme Settings */}
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Appearance
          </Typography>
          <FormControlLabel
            control={<Switch checked={isDark} onChange={toggleTheme} />}
            label={isDark ? "Dark Mode" : "Light Mode"}
          />
        </Paper>

        {/* Model Settings */}
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Models
          </Typography>

          {/* LLM Selection */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Active LLM</InputLabel>
            <Select
              value={activeLLM}
              label="Active LLM"
              onChange={(e) => handleLLMChange(e.target.value)}
              disabled={isLoading || downloadedLLMs.length === 0}
            >
              {downloadedLLMs.length === 0 ? (
                <MenuItem value="">
                  <em>No LLM models downloaded</em>
                </MenuItem>
              ) : (
                downloadedLLMs.map((model) => (
                  <MenuItem key={model.id} value={model.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {model.description.name}
                      {model.isSelectedLlm && <CheckCircleIcon fontSize="small" color="success" />}
                    </Box>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          {/* Embedding Model Selection */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Active Embedding Model</InputLabel>
            <Select
              value={activeEmbeddingModel}
              label="Active Embedding Model"
              onChange={(e) => handleEmbeddingChange(e.target.value)}
              disabled={isLoading || downloadedEmbeddings.length === 0}
            >
              {downloadedEmbeddings.length === 0 ? (
                <MenuItem value="">
                  <em>No embedding models downloaded</em>
                </MenuItem>
              ) : (
                downloadedEmbeddings.map((model) => (
                  <MenuItem key={model.id} value={model.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {model.description.name}
                      {model.isSelectedEmbedding && <CheckCircleIcon fontSize="small" color="success" />}
                    </Box>
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => setDownloadDialogOpen(true)}
            fullWidth
          >
            Download More Models
          </Button>
        </Paper>

        {/* Storage & Cache */}
        <Paper sx={{ p: 3, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Storage
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Downloaded Models: {models.filter(m => m.status === "downloaded").length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Documents: Loading...
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* About */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            About
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography variant="body2">
              <strong>Pinguin</strong> - AI Study Companion
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Version: {appVersion}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Offline, privacy-focused AI for university students
            </Typography>
          </Box>
        </Paper>
      </Box>

      {/* Download Models Dialog */}
      <Dialog
        open={downloadDialogOpen}
        onClose={() => setDownloadDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Download Models
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={modelTypeFilter}
                onChange={(e) => setModelTypeFilter(e.target.value as "llm" | "embedding")}
              >
                <MenuItem value="llm">LLM Models</MenuItem>
                <MenuItem value="embedding">Embedding Models</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogTitle>
        <DialogContent>
          <List>
            {filteredModelsForDownload.map((model) => {
              const progress = getModelProgress(model.id);
              const isDownloading = model.status === "downloading" || !!progress;
              const isDownloaded = model.status === "downloaded";

              return (
                <ListItem
                  key={model.id}
                  secondaryAction={
                    isDownloaded ? (
                      <IconButton
                        edge="end"
                        onClick={() => handleDeleteClick(model.id)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    ) : isDownloading ? (
                      <Button
                        size="small"
                        onClick={() => abortDownload(model.id)}
                        color="error"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <IconButton
                        edge="end"
                        onClick={() => handleDownloadClick(model.id)}
                        color="primary"
                      >
                        <DownloadIcon />
                      </IconButton>
                    )
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {model.description.name}
                        {isDownloaded && <Chip label="Downloaded" size="small" color="success" />}
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" display="block">
                          {model.description.description}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Size: {model.description.size} MB | Min RAM: {model.description.minimumRAM} GB
                        </Typography>
                        {isDownloading && progress && (
                          <Box sx={{ mt: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={progress.percentage || 0}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {progress.status} - {progress.percentage || 0}%
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingsPanel;
