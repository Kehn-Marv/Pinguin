import { useState, useEffect, useCallback } from "react";
import { useElectron } from "./useElectron";
import { type ProgressResponse } from "ollama";

interface DownloadProgress {
  status: string;
  completed?: number;
  total?: number;
  percentage?: number;
}

interface UseModelsResult {
  models: Model[];
  isLoading: boolean;
  error: string | null;
  downloadProgress: Map<string, DownloadProgress>;
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  abortDownload: (modelId: string) => Promise<void>;
  refreshModels: () => Promise<void>;
}

export const useModels = (): UseModelsResult => {
  const api = useElectron();
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map());

  // Load models on mount
  useEffect(() => {
    loadModels();
  }, []);

  // Subscribe to model updates
  useEffect(() => {
    api.model.subscribeToAll((_, models: Model[]) => {
      setModels(models);
    });

    return () => {
      api.model.unsubscribeFromAll();
    };
  }, [api]);

  const loadModels = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const modelList = await api.model.getAll();
      setModels(modelList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadModel = useCallback(async (modelId: string) => {
    setError(null);
    
    try {
      // Subscribe to download progress for this model
      api.model.subscribeToDownloadProgress(modelId, (_, status: ProgressResponse) => {
        const progress: DownloadProgress = {
          status: status.status,
          completed: status.completed,
          total: status.total,
        };

        if (status.completed && status.total) {
          progress.percentage = Math.round((status.completed / status.total) * 100);
        }

        setDownloadProgress(prev => {
          const newMap = new Map(prev);
          newMap.set(modelId, progress);
          return newMap;
        });
      });

      await api.model.download(modelId);
      
      // Clean up progress after download completes
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newMap = new Map(prev);
          newMap.delete(modelId);
          return newMap;
        });
        api.model.unsubscribeFromDownloadProgress(modelId);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download model");
      api.model.unsubscribeFromDownloadProgress(modelId);
    }
  }, [api]);

  const deleteModel = useCallback(async (modelId: string) => {
    setError(null);
    
    try {
      await api.model.delete(modelId);
      // Models will be updated via subscription
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete model");
    }
  }, [api]);

  const abortDownload = useCallback(async (modelId: string) => {
    setError(null);
    
    try {
      await api.model.abortDownloading(modelId);
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(modelId);
        return newMap;
      });
      api.model.unsubscribeFromDownloadProgress(modelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to abort download");
    }
  }, [api]);

  const refreshModels = useCallback(async () => {
    await loadModels();
  }, []);

  return {
    models,
    isLoading,
    error,
    downloadProgress,
    downloadModel,
    deleteModel,
    abortDownload,
    refreshModels,
  };
};
