import { ipcMain } from "electron";
import OllamaStarter from "./OllamaStarter";
import ProcessManager from "../ProcessManager";

ipcMain.handle("ollama:isReady", async () => {
  // Check ProcessManager first (new system)
  const processManager = ProcessManager.getInstance();
  const isRunning = processManager.isOllamaRunning();
  console.log(`[ollama:isReady] ProcessManager status: ${isRunning}`);
  
  if (isRunning) {
    return true;
  }
  
  // Fallback to OllamaStarter (old system) for backwards compatibility
  const ollama = OllamaStarter.getInstance();
  const status = ollama.getOllamaStatus();
  console.log(`[ollama:isReady] OllamaStarter status: ${status}`);
  
  if (status === "running") {
    return true;
  }
  
  // Final check: Actually ping Ollama to see if it's running externally
  try {
    const defaultHost = "http://localhost:11434";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(defaultHost, {
      method: "GET",
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log(`[ollama:isReady] Found running Ollama instance at ${defaultHost}`);
      return true;
    }
  } catch (error) {
    console.log(`[ollama:isReady] No external Ollama found: ${error}`);
  }
  
  return false;
});

export const startOllama = async () => {
  const ollama = OllamaStarter.getInstance();
  await ollama.start();
};

export const stopOllama = () => {
  const ollama = OllamaStarter.getInstance();
  ollama.stop();
};

export const getOllamaHost = () => {
  // Check ProcessManager first
  const processManager = ProcessManager.getInstance();
  if (processManager.isOllamaRunning()) {
    return processManager.getOllamaHost();
  }
  
  // Fallback to OllamaStarter
  const ollama = OllamaStarter.getInstance();
  return ollama.getHost();
};
