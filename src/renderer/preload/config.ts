import { ipcRenderer } from "electron";

const config = {
  getTheme: (): Promise<"light" | "dark"> => {
    return ipcRenderer.invoke("config:theme:get");
  },
  setTheme: (theme: "light" | "dark") => {
    ipcRenderer.invoke("config:theme:set", theme);
  },
  get: <T = any>(key: string): Promise<T> => {
    return ipcRenderer.invoke("config:get", key);
  },
  set: (key: string, value: any): Promise<void> => {
    return ipcRenderer.invoke("config:set", key, value);
  },
};

export type IConfigAPI = typeof config;
export default config;
