import { ipcRenderer } from "electron";

const shell = {
  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke("shell:openExternal", url);
  },
};

export default shell;
