import { isModelId } from "./models";
import ModelsManager from "./ModelsManager";
import { ipcMain } from "electron";

ipcMain.handle("model:getAll", async () => {
  try {
    const modelManager = await ModelsManager.getInstance();
    return modelManager.getModels();
  } catch (error: any) {
    console.error("Error getting all models:", error?.message || error);
    return [];
  }
});

ipcMain.handle("model:download", async (event, modelId: string) => {
  const modelManager = await ModelsManager.getInstance();
  if (!isModelId(modelId)) return;
  modelManager.downloadModel(modelId);
});

ipcMain.handle("model:abortDownloading", async (event, modelId: string) => {
  if (!isModelId(modelId)) return;
  const modelManager = await ModelsManager.getInstance();
  modelManager.abortDownloadingModel(modelId);
});

ipcMain.handle("model:delete", async (event, modelId: string) => {
  if (!isModelId(modelId)) return;
  const modelManager = await ModelsManager.getInstance();
  modelManager.deleteModel(modelId);
});

ipcMain.handle("model:setSelectedEmbedding", async (event, modelId: string) => {
  if (!isModelId(modelId)) return;
  const modelManager = await ModelsManager.getInstance();
  await modelManager.selectEmbedding(modelId);
});

ipcMain.handle("model:setSelectedLLM", async (event, modelId: string) => {
  if (!isModelId(modelId)) return;
  const modelManager = await ModelsManager.getInstance();
  await modelManager.selectLLM(modelId);
});

ipcMain.handle("model:getSelectedEmbedding", async () => {
  try {
    const modelManager = await ModelsManager.getInstance();
    return modelManager.getSelectedEmbedding();
  } catch (error: any) {
    console.error("Error getting selected embedding:", error?.message || error);
    return null;
  }
});

ipcMain.handle("model:getSelectedLLM", async () => {
  try {
    const modelManager = await ModelsManager.getInstance();
    return modelManager.getSelectedLLM();
  } catch (error: any) {
    console.error("Error getting selected LLM:", error?.message || error);
    return null;
  }
});

ipcMain.handle("model:refreshList", async () => {
  const modelManager = await ModelsManager.getInstance();
  await modelManager.refreshModelList();
});

export const getEmbeddingsModel = async () => {
  const modelManager = await ModelsManager.getInstance();
  return modelManager.getSelectedEmbedding();
};

export const getLLM = async () => {
  const modelManager = await ModelsManager.getInstance();
  return modelManager.getSelectedLLM();
};
