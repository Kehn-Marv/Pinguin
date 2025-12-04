import { ProgressResponse } from "ollama";
import { webContents } from "electron";
import ConfigStore from "../ConfigStore";
import logger from "electron-log";

const log = logger.log;

export const notifyDownloadingStatus = (
  modelId: ModelID,
  status: ProgressResponse
) => {
  const windows = webContents.getAllWebContents();
  windows.forEach((window) => {
    window.send(`model:downloading:${modelId}`, status);
  });
};

export const notifyModelsUpdate = (models: Model[]) => {
  const windows = webContents.getAllWebContents();
  windows.forEach((window) => {
    window.send("model:update", models);
  });
};

export const notifySelectedEmbeddingUpdate = (modelId: ModelID | null) => {
  // Update ConfigStore to keep it in sync
  try {
    const configStore = ConfigStore.getInstance();
    configStore.set("activeEmbeddingModel", modelId || "");
    log(`ConfigStore updated with embedding model: ${modelId || "(none)"}`);
  } catch (error: unknown) {
    log(`Failed to update ConfigStore with embedding model: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Notify renderer processes
  const windows = webContents.getAllWebContents();
  windows.forEach((window) => {
    window.send("model:selectedEmbedding", modelId);
  });
};

export const notifySelectedLLMUpdate = (modelId: ModelID | null) => {
  // Update ConfigStore to keep it in sync
  try {
    const configStore = ConfigStore.getInstance();
    configStore.set("activeLLM", modelId || "");
    log(`ConfigStore updated with LLM model: ${modelId || "(none)"}`);
  } catch (error: unknown) {
    log(`Failed to update ConfigStore with LLM model: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Notify renderer processes
  const windows = webContents.getAllWebContents();
  windows.forEach((window) => {
    window.send("model:selectedLLM", modelId);
  });
}
