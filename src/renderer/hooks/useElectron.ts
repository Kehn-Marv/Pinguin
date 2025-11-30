/**
 * Hook that provides access to the Electron API
 * This is a simple wrapper around window.api for type safety
 */
export const useElectron = () => {
  if (!window.api) {
    throw new Error("Electron API not available");
  }
  
  return window.api;
};
