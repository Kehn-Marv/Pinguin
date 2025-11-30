import { ModelResponse, Ollama } from "ollama";
import { modelsDescription, isLLMModelId, isEmbeddingModelId } from "./models";
import {
  notifyDownloadingStatus,
  notifyModelsUpdate,
  notifySelectedEmbeddingUpdate,
  notifySelectedLLMUpdate,
} from "./notifier";
import logger from "electron-log";
const log = logger.log;
import { app } from "electron";
import path from "path";
import fs from "fs";
import { getOllamaHost } from "../ollama";
import ConfigStore from "../ConfigStore";

class ModelsManager {
  private static instance: ModelsManager;
  private inititalOnDeviceModels: ModelResponse[] = [];
  private ollama: Ollama;
  private downloaingModelsAbort: Map<ModelID, () => void>;
  private models: Model[] = [];
  private selectedLLM: ModelID | null = null;
  private selectedEmbedding: ModelID | null = null;
  private selectedLLMFilePath: string;
  private selectedEmbeddingFilePath: string;
  private modelListCache: ModelResponse[] | null;
  private modelListCacheTimestamp: number;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private refreshInterval: NodeJS.Timeout | null;

  private constructor() {
    // Initialize with a default host, will be updated in init()
    this.ollama = new Ollama({ host: "http://localhost:11434" });
    this.downloaingModelsAbort = new Map();
    this.modelListCache = null;
    this.modelListCacheTimestamp = 0;
    this.refreshInterval = null;
    this.selectedLLMFilePath = path.join(
      app.getPath("userData"),
      "selectedLLM.txt"
    );
    if (!fs.existsSync(this.selectedLLMFilePath)) {
      fs.writeFileSync(this.selectedLLMFilePath, "");
    }
    this.selectedEmbeddingFilePath = path.join(
      app.getPath("userData"),
      "selectedEmbedding.txt"
    );
    if (!fs.existsSync(this.selectedEmbeddingFilePath)) {
      fs.writeFileSync(this.selectedEmbeddingFilePath, "");
    }
  }

  public static async getInstance(): Promise<ModelsManager> {
    if (!ModelsManager.instance) {
      ModelsManager.instance = new ModelsManager();
      await ModelsManager.instance.init();
    }
    return ModelsManager.instance;
  }

  private async init() {
    // Update Ollama client with the correct host once Ollama is ready
    try {
      const host = getOllamaHost();
      this.ollama = new Ollama({ host });
      log(`ModelsManager initialized with Ollama host: ${host}`);
    } catch (error: any) {
      log(`Warning: Could not get Ollama host during init: ${error?.message || error}`);
      // Continue with default host, will retry on first operation
    }
    
    await this.getInitialOnDeviceModels();
    this.initializeSelectedLLM();
    this.initializeSelectedEmbedding();
    this.initializeModels();
    this.startPeriodicRefresh();
  }

  private initializeSelectedLLM(): void {
    let llm = fs.readFileSync(this.selectedLLMFilePath, "utf-8").trim();
    
    // If file is empty, try to load from ConfigStore as fallback
    if (!llm) {
      try {
        const configStore = ConfigStore.getInstance();
        const configLLM = configStore.get("activeLLM");
        if (configLLM) {
          log(`Loading LLM model from ConfigStore: ${configLLM}`);
          llm = configLLM;
          // Sync to file
          fs.writeFileSync(this.selectedLLMFilePath, llm);
        }
      } catch (error: unknown) {
        log(`Could not load LLM from ConfigStore: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    if (!llm || !isLLMModelId(llm)) {
      if (llm) {
        log(`Invalid LLM model: "${llm}"`);
      }
      fs.writeFileSync(this.selectedLLMFilePath, "");
      this.selectedLLM = null;
      return;
    }
    const status = this.getInitialModelStatus(llm);
    if (status !== "downloaded") {
      log(`LLM model ${llm} is not downloaded`);
      fs.writeFileSync(this.selectedLLMFilePath, "");
      this.selectedLLM = null;
      return;
    }
    log(`Selected LLM model: ${llm}`);
    this.selectedLLM = llm;
  }

  private initializeSelectedEmbedding(): void {
    let embedding = fs.readFileSync(this.selectedEmbeddingFilePath, "utf-8").trim();
    
    // If file is empty, try to load from ConfigStore as fallback
    if (!embedding) {
      try {
        const configStore = ConfigStore.getInstance();
        const configEmbedding = configStore.get("activeEmbeddingModel");
        if (configEmbedding) {
          log(`Loading embedding model from ConfigStore: ${configEmbedding}`);
          embedding = configEmbedding;
          // Sync to file
          fs.writeFileSync(this.selectedEmbeddingFilePath, embedding);
        }
      } catch (error: unknown) {
        log(`Could not load embedding from ConfigStore: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    if (!embedding || !isEmbeddingModelId(embedding)) {
      if (embedding) {
        log(`Invalid embedding model: "${embedding}"`);
      }
      fs.writeFileSync(this.selectedEmbeddingFilePath, "");
      this.selectedEmbedding = null;
      return;
    }
    const status = this.getInitialModelStatus(embedding);
    if (status !== "downloaded") {
      log(`Embedding model ${embedding} is not downloaded`);
      fs.writeFileSync(this.selectedEmbeddingFilePath, "");
      this.selectedEmbedding = null;
      return;
    }
    log(`Selected embedding model: ${embedding}`);
    this.selectedEmbedding = embedding;
  }

  private initializeModels(): void {
    const models: Model[] = [];
    for (const description of modelsDescription) {
      const status = this.getInitialModelStatus(description.id);
      const isSelectedLlm =
        description.id === this.selectedLLM && description.type === "llm";
      const isSelectedEmbedding =
        description.id === this.selectedEmbedding &&
        description.type === "embedding";
      models.push({
        id: description.id,
        status,
        description,
        isSelectedLlm: isSelectedLlm,
        isSelectedEmbedding: isSelectedEmbedding,
      });
    }
    this.models = models;
  }

  private getInitialModelStatus(modelId: ModelID): ModelStatus {
    for (const model of this.inititalOnDeviceModels)
      if (model.name.startsWith(modelId)) return "downloaded";
    return "not downloaded";
  }

  private async getInitialOnDeviceModels(): Promise<void> {
    try {
      const { models } = await this.ollama.list();
      this.inititalOnDeviceModels = models;
      this.modelListCache = models;
      this.modelListCacheTimestamp = Date.now();
    } catch (error: any) {
      log(`Warning: Could not fetch initial model list: ${error?.message || error}`);
      // Initialize with empty list, will be populated on first successful fetch
      this.inititalOnDeviceModels = [];
      this.modelListCache = [];
      this.modelListCacheTimestamp = Date.now();
    }
  }

  /**
   * Get list of models from Ollama with caching
   * Returns cached list if still valid, otherwise fetches fresh data
   */
  private async getOnDeviceModels(): Promise<ModelResponse[]> {
    const now = Date.now();
    const cacheAge = now - this.modelListCacheTimestamp;

    // Return cached list if still valid
    if (this.modelListCache && cacheAge < this.CACHE_TTL_MS) {
      log(`Returning cached model list (age: ${Math.round(cacheAge / 1000)}s)`);
      return this.modelListCache;
    }

    // Fetch fresh list
    try {
      log("Fetching fresh model list from Ollama");
      const { models } = await this.ollama.list();
      this.modelListCache = models;
      this.modelListCacheTimestamp = now;
      return models;
    } catch (error: any) {
      log(`Error fetching model list: ${error?.message || error}`);
      // Return stale cache if available
      if (this.modelListCache) {
        log("Returning stale cached model list due to error");
        return this.modelListCache;
      }
      throw error;
    }
  }

  /**
   * Start periodic refresh of model list
   */
  private startPeriodicRefresh(): void {
    // Refresh every 5 minutes
    this.refreshInterval = setInterval(async () => {
      try {
        log("Performing periodic model list refresh");
        await this.refreshModelList();
      } catch (error: any) {
        log(`Error during periodic refresh: ${error?.message || error}`);
      }
    }, this.CACHE_TTL_MS);
  }

  /**
   * Stop periodic refresh
   */
  public stopPeriodicRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      log("Stopped periodic model list refresh");
    }
  }

  /**
   * Manually refresh the model list
   */
  public async refreshModelList(): Promise<void> {
    log("Manually refreshing model list");
    const onDeviceModels = await this.getOnDeviceModels();
    
    // Update model statuses based on fresh data
    const updatedModels = this.models.map((model) => {
      const isOnDevice = onDeviceModels.some((m) => m.name.startsWith(model.id));
      const newStatus: ModelStatus = isOnDevice ? "downloaded" : "not downloaded";
      
      // If model was selected but is no longer available, reset selection
      if (newStatus === "not downloaded") {
        if (model.isSelectedLlm) {
          log(`Selected LLM ${model.id} is no longer available`);
          this.resetSelectedLLM();
        }
        if (model.isSelectedEmbedding) {
          log(`Selected embedding ${model.id} is no longer available`);
          this.resetSelectedEmbedding();
        }
      }
      
      return { ...model, status: newStatus };
    });
    
    this.setModels(updatedModels);
  }

  public downloadModel(modelId: ModelID): void {
    const model = this.models.find((model) => model.id === modelId);
    if (!model || model.status !== "not downloaded") {
      log(`Model ${modelId} is already downloaded or not found`);
      return;
    }
    log(`Downloading model ${modelId}`);
    this.ollama.pull({ model: modelId, stream: true }).then(async (stream) => {
      this.downloaingModelsAbort.set(modelId, () => stream.abort());
      try {
        this.setModelStatus(modelId, "downloading");
        for await (const chunk of stream) {
          notifyDownloadingStatus(modelId, chunk);
        }
        this.downloaingModelsAbort.delete(modelId);
        this.setModelStatus(modelId, "downloaded");
      } catch (error) {
        log(`Error downloading model ${modelId}`);
        this.setModelStatus(modelId, "not downloaded");
        this.downloaingModelsAbort.delete(modelId);
      }
    });
  }

  public abortDownloadingModel(modelId: ModelID): void {
    const abort = this.downloaingModelsAbort.get(modelId);
    log(`Aborting downloading model ${modelId}`);
    if (abort) {
      abort();
      this.downloaingModelsAbort.delete(modelId);
      this.setModelStatus(modelId, "not downloaded");
    } else {
      log(`Model ${modelId} is not downloading`);
    }
  }

  public deleteModel(modelId: ModelID): void {
    log(`Deleting model ${modelId}`);
    const model = this.models.find((model) => model.id === modelId);
    if (!model) {
      log(`Model ${modelId} not found`);
      return;
    }
    if (model.isSelectedLlm) this.resetSelectedLLM();
    if (model.isSelectedEmbedding) this.resetSelectedEmbedding();
    this.ollama.delete({ model: modelId }).then(() => {
      this.setModelStatus(modelId, "not downloaded");
    });
  }

  public getModels(): Model[] {
    return this.models;
  }

  public getSelectedLLM(): ModelID | null {
    return this.selectedLLM;
  }

  public getSelectedEmbedding(): ModelID | null {
    return this.selectedEmbedding;
  }

  /**
   * Validate that a model exists in Ollama
   */
  private async validateModelExists(modelId: ModelID): Promise<boolean> {
    try {
      await this.ollama.show({ model: modelId });
      return true;
    } catch (error: unknown) {
      log(`Model validation failed for ${modelId}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  public async selectLLM(modelId: ModelID): Promise<void> {
    log(`Selecting LLM model ${modelId}`);
    const model = this.models.find((m) => m.id === modelId);
    if (!model) {
      log(`Model ${modelId} not found in model list`);
      return;
    }
    
    if (model.status !== "downloaded") {
      log(`Model ${modelId} is not downloaded`);
      return;
    }

    // Validate model exists in Ollama
    const exists = await this.validateModelExists(modelId);
    if (!exists) {
      log(`Model ${modelId} does not exist in Ollama, updating status`);
      this.setModelStatus(modelId, "not downloaded");
      return;
    }

    const previousSelectedLLM = this.selectedLLM;
    this.selectedLLM = modelId;
    notifySelectedLLMUpdate(modelId);
    fs.writeFileSync(this.selectedLLMFilePath, modelId);
    this.setModels(
      this.models.map((model) =>
        model.id === previousSelectedLLM
          ? { ...model, isSelectedLlm: false }
          : model.id === modelId
          ? { ...model, isSelectedLlm: true }
          : model
      )
    );
  }

  public async selectEmbedding(modelId: ModelID): Promise<void> {
    log(`Selecting embedding model ${modelId}`);
    const model = this.models.find((m) => m.id === modelId);
    if (!model) {
      log(`Model ${modelId} not found in model list`);
      return;
    }
    
    if (model.status !== "downloaded") {
      log(`Model ${modelId} is not downloaded`);
      return;
    }

    // Validate model exists in Ollama
    const exists = await this.validateModelExists(modelId);
    if (!exists) {
      log(`Model ${modelId} does not exist in Ollama, updating status`);
      this.setModelStatus(modelId, "not downloaded");
      return;
    }

    const previousSelectedEmbedding = this.selectedEmbedding;
    
    // Only restart backend if the model actually changed
    const modelChanged = previousSelectedEmbedding !== modelId;
    
    this.selectedEmbedding = modelId;
    notifySelectedEmbeddingUpdate(modelId);
    fs.writeFileSync(this.selectedEmbeddingFilePath, modelId);
    this.setModels(
      this.models.map((model) =>
        model.id === previousSelectedEmbedding
          ? { ...model, isSelectedEmbedding: false }
          : model.id === modelId
          ? { ...model, isSelectedEmbedding: true }
          : model
      )
    );

    // Restart Python backend with new embedding model if it changed
    if (modelChanged) {
      log(`Embedding model changed from ${previousSelectedEmbedding} to ${modelId}, restarting backend`);
      try {
        // Dynamically import ProcessManager to avoid circular dependency
        const ProcessManager = (await import("../ProcessManager")).default;
        const processManager = ProcessManager.getInstance();
        
        // Only restart if backend is currently running
        if (processManager.isPythonBackendRunning()) {
          await processManager.restartPythonBackend(modelId);
          log("Backend restarted successfully with new embedding model");
        } else {
          log("Backend not running, will use new model on next start");
        }
      } catch (error: unknown) {
        log(`Failed to restart backend with new embedding model: ${error instanceof Error ? error.message : String(error)}`);
        // Don't throw - model selection succeeded, backend restart is best-effort
      }
    }
  }

  private resetSelectedLLM(): void {
    log(`Resetting selected LLM model`);
    this.selectedLLM = null;
    notifySelectedLLMUpdate(null);
    fs.writeFileSync(this.selectedLLMFilePath, "");
    this.setModels(
      this.models.map((model) =>
        model.isSelectedLlm ? { ...model, isSelectedLlm: false } : model
      )
    );
  }

  private resetSelectedEmbedding(): void {
    log(`Resetting selected embedding model`);
    this.selectedEmbedding = null;
    notifySelectedEmbeddingUpdate(null);
    fs.writeFileSync(this.selectedEmbeddingFilePath, "");
    this.setModels(
      this.models.map((model) =>
        model.isSelectedEmbedding
          ? { ...model, isSelectedEmbedding: false }
          : model
      )
    );
  }

  private setModelStatus(modelId: ModelID, status: ModelStatus): void {
    this.setModels(
      this.models.map((model) =>
        model.id === modelId ? { ...model, status } : model
      )
    );
  }

  private setModels(models: Model[]): void {
    this.models = models;
    notifyModelsUpdate(models);
  }
}

export default ModelsManager;
