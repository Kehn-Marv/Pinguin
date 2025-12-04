import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type StudyMode = "files" | "coding" | "thinking";

interface AppState {
  theme: "light" | "dark" | "system";
  activeLLM: string;
  activeEmbeddingModel: string;
  studyMode: StudyMode;
  isInitialized: boolean;
}

interface AppContextType extends AppState {
  setTheme: (theme: "light" | "dark" | "system") => Promise<void>;
  setActiveLLM: (model: string) => Promise<void>;
  setActiveEmbeddingModel: (model: string) => Promise<void>;
  setStudyMode: (mode: StudyMode) => void;
  refreshConfig: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>({
    theme: "system",
    activeLLM: "",
    activeEmbeddingModel: "",
    studyMode: "files",
    isInitialized: false,
  });

  // Load initial state from electron-store
  useEffect(() => {
    loadInitialState();
  }, []);

  const loadInitialState = async () => {
    try {
      // Load theme
      const theme = await window.api.config.getTheme();
      
      // Load selected models
      const selectedLLM = await window.api.model.getSelectedLLM();
      const selectedEmbedding = await window.api.model.getSelectedEmbedding();

      setState({
        theme: theme || "system",
        activeLLM: selectedLLM || "",
        activeEmbeddingModel: selectedEmbedding || "",
        studyMode: "files", // Default mode
        isInitialized: true,
      });
    } catch (error) {
      console.error("Failed to load initial state:", error);
      setState(prev => ({ ...prev, isInitialized: true }));
    }
  };

  const setTheme = async (theme: "light" | "dark" | "system") => {
    try {
      // Current API only supports "light" | "dark"
      const actualTheme = theme === "system" ? "dark" : theme;
      await window.api.config.setTheme(actualTheme);
      setState(prev => ({ ...prev, theme }));
    } catch (error) {
      console.error("Failed to set theme:", error);
    }
  };

  const setActiveLLM = async (model: string) => {
    try {
      await window.api.model.setSelectedLLM(model as ModelID);
      setState(prev => ({ ...prev, activeLLM: model }));
    } catch (error) {
      console.error("Failed to set active LLM:", error);
    }
  };

  const setActiveEmbeddingModel = async (model: string) => {
    try {
      await window.api.model.setSelectedEmbedding(model as ModelID);
      setState(prev => ({ ...prev, activeEmbeddingModel: model }));
    } catch (error) {
      console.error("Failed to set active embedding model:", error);
    }
  };

  const setStudyMode = (mode: StudyMode) => {
    setState(prev => ({ ...prev, studyMode: mode }));
  };

  const refreshConfig = async () => {
    await loadInitialState();
  };

  return (
    <AppContext.Provider
      value={{
        ...state,
        setTheme,
        setActiveLLM,
        setActiveEmbeddingModel,
        setStudyMode,
        refreshConfig,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
