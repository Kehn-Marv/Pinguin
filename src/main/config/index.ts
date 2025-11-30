import configFileManager from "./configFileManager";
import { ipcMain } from "electron";
import Logger from "electron-log";
import fs from "fs";
import ConfigStore from "../ConfigStore";

const configStore = ConfigStore.getInstance();

ipcMain.handle("config:theme:get", async () => {
  return getTheme();
});

ipcMain.handle("config:theme:set", async (_, theme: "light" | "dark") => {
  setTheme(theme);
});

// Generic ConfigStore handlers
ipcMain.handle("config:get", async (_, key: string) => {
  return configStore.get(key as any);
});

ipcMain.handle("config:set", async (_, key: string, value: any) => {
  configStore.set(key as any, value);
});

const getTheme = (): "light" | "dark" => {
  return configFileManager.getKeyValue("theme");
};

const setTheme = (theme: "light" | "dark"): void => {
  configFileManager.setKeyValue("theme", theme);
};

/**
 * Get the folder where ollama models are installed in the case of using the prepackaged server
 * @returns The folder where ollama models are installed
 */
export const getModelInstallationFolder = (): string => {
  const folder = configFileManager.getKeyValue("modelInstallationLocation");
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return folder;
};
